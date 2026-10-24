
import cds from "@sap/cds"

const { SELECT, UPDATE } = cds.ql;

function toCents(value) {
    const n = Number(value);

    if (!Number.isFinite(n) || n < 0) {
        throw new Error("Invalid monetary value");
    }

    return Math.round(n * 100);
}

function toMoney(cents) {
    return (cents / 100).toFixed(2);
}

module.exports = cds.service.impl(function () {
    const { Orders, OrderItems, Items } =
        cds.entities("dto.events");

    // Register handlers specifically for EventService.
    this.before("CREATE", "Orders", async (req) => {
        const order = req.data;

        if (!Array.isArray(order.items) || order.items.length === 0) {
            return req.reject(
                400,
                "An order must contain at least one item."
            );
        }

        if (
            typeof order.currencyCode !== "string" ||
            !/^[A-Z]{3}$/.test(order.currencyCode)
        ) {
            return req.reject(
                400,
                "currencyCode must be a three-letter uppercase code."
            );
        }

        order.orderNumber =
            `ORD-${cds.utils.uuid().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

        order.status = "CREATED";
        delete order.orderAmount;

        const requestedQuantities = new Map();

        for (const line of order.items) {
            const productId = line.item_ID || line.item?.ID;
            const quantity = Number(line.quantity);

            if (!productId) {
                return req.reject(
                    400,
                    "Every order item must reference a product."
                );
            }

            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                return req.reject(
                    400,
                    "Quantity must be a positive integer."
                );
            }

            line.item_ID = productId;
            requestedQuantities.set(
                productId,
                (requestedQuantities.get(productId) || 0) + quantity
            );

            // Ignore client-provided price calculations.
            delete line.unitPrice;
            delete line.lineAmount;
        }

        const productIds = [...requestedQuantities.keys()];

        const products = await SELECT.from(Items).where({
            ID: { in: productIds }
        });

        const productsById = new Map(
            products.map(product => [product.ID, product])
        );

        // Validate every product before reserving stock.
        for (const productId of productIds) {
            const product = productsById.get(productId);

            if (!product) {
                return req.reject(
                    400,
                    `Product ${productId} does not exist.`
                );
            }

            if (
                !Number.isSafeInteger(product.availableQuantity) ||
                product.availableQuantity < 0
            ) {
                return req.reject(
                    409,
                    `Invalid inventory for ${product.name}.`
                );
            }

            const requested = requestedQuantities.get(productId);

            if (product.availableQuantity < requested) {
                return req.reject(
                    409,
                    `Insufficient stock for ${product.name}. ` +
                    `Available: ${product.availableQuantity}, requested: ${requested}.`
                );
            }

            try {
                toCents(product.price);
            } catch {
                return req.reject(
                    409,
                    `Invalid price for ${product.name}.`
                );
            }
        }

        // Calculate line amounts and total using trusted product prices.
        let totalCents = 0;

        for (const line of order.items) {
            const product = productsById.get(line.item_ID);
            const unitPriceCents = toCents(product.price);
            const lineCents = unitPriceCents * line.quantity;

            if (!Number.isSafeInteger(lineCents)) {
                return req.reject(400, "Order line amount is too large.");
            }

            line.unitPrice = toMoney(unitPriceCents);
            line.lineAmount = toMoney(lineCents);

            totalCents += lineCents;

            if (!Number.isSafeInteger(totalCents)) {
                return req.reject(400, "Order total is too large.");
            }
        }

        order.orderAmount = toMoney(totalCents);

        // Reserve stock using conditional updates to protect against
        // concurrent orders exceeding the available quantity.
        for (const productId of productIds) {
            const quantity = requestedQuantities.get(productId);

            const affectedRows = await UPDATE(Items)
                .set({
                    availableQuantity: { "-=": quantity }
                })
                .where({
                    ID: productId,
                    availableQuantity: { ">=": quantity }
                });

            if (affectedRows === 0) {
                return req.reject(
                    409,
                    `Stock changed for product ${productId}. Please retry.`
                );
            }
        }
    });

    // Prevent direct modifications from bypassing business rules.
    this.before("UPDATE", "Orders", req =>
        req.reject(
            405,
            "Use the confirm or cancel action to change order status."
        )
    );

    this.before("DELETE", "Orders", req =>
        req.reject(
            405,
            "Orders cannot be deleted. Cancel the order instead."
        )
    );

    this.before("CREATE", "OrderItems", req =>
        req.reject(
            405,
            "Create order items through the Orders entity."
        )
    );

    this.before(["UPDATE", "DELETE"], "OrderItems", req =>
        req.reject(
            405,
            "Order items cannot be modified directly."
        )
    );

    this.before(["CREATE", "UPDATE", "DELETE"], "Items", req =>
        req.reject(
            405,
            "Product maintenance is not enabled through this service."
        )
    );

    // Confirm a newly created order.
    this.on("confirm", "Orders", async (req) => {
        const orderId = req.params?.[0]?.ID;

        if (!orderId) {
            return req.reject(400, "Order ID is required.");
        }

        const affectedRows = await UPDATE(Orders)
            .set({ status: "CONFIRMED" })
            .where({
                ID: orderId,
                status: "CREATED"
            });

        if (affectedRows === 0) {
            return req.reject(
                409,
                "Order not found or cannot be confirmed from its current status."
            );
        }

        return SELECT.one.from(Orders).where({ ID: orderId });
    });

    // Cancel a created order and release its reserved stock.
    this.on("cancel", "Orders", async (req) => {
        const orderId = req.params?.[0]?.ID;

        if (!orderId) {
            return req.reject(400, "Order ID is required.");
        }

        const affectedRows = await UPDATE(Orders)
            .set({ status: "CANCELLED" })
            .where({
                ID: orderId,
                status: "CREATED"
            });

        if (affectedRows === 0) {
            return req.reject(
                409,
                "Order not found or cannot be cancelled from its current status."
            );
        }

        const lines = await SELECT.from(OrderItems).where({
            order_ID: orderId
        });

        for (const line of lines) {
            const affected = await UPDATE(Items)
                .set({
                    availableQuantity: { "+=": line.quantity }
                })
                .where({ ID: line.item_ID });

            if (affected === 0) {
                return req.reject(
                    500,
                    `Failed to restore stock for product ${line.item_ID}.`
                );
            }
        }

        return SELECT.one.from(Orders).where({ ID: orderId });
    });
});
