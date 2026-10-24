using { dto.events as event } from '../db/schema';

service EventService @(path: '/events') {

    entity Orders as projection on event.Orders actions {
        action confirm() returns Orders;
        action cancel() returns Orders;
    };

    entity OrderItems as projection on event.OrderItems;

    @readonly
    entity Items as projection on event.Items;

}
