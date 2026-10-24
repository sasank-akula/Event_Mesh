namespace dto.events;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity Orders : cuid, managed {
    @mandatory
    orderNumber : String(30);

    status : String enum {
        CREATED;
        CONFIRMED;
        CANCELLED;
    } default 'CREATED';

    orderAmount : Decimal(15,2);

    @mandatory
    currencyCode : String(3);

    items : Composition of many OrderItems
        on items.order = $self;
}

entity OrderItems : cuid, managed {
    order      : Association to Orders;
    item       : Association to Items;
    quantity   : Integer;
    unitPrice  : Decimal(15,2);
    lineAmount : Decimal(15,2);
}

entity Items : cuid, managed {
    sku               : String(40);
    name              : String(100);
    description       : String(500);
    availableQuantity : Integer;
    price             : Decimal(15,2);
}