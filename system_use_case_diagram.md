# System Use Case Diagram

This use case diagram outlines the primary interactions between the system's users (Admin and Staff) and the core features of the J-Lin Inventory and POS System.

```mermaid
flowchart LR
    A((Admin))

    subgraph System [J-Lin Inventory & POS System]
        UC1([Login / Authentication])
        UC2([Process Sales / POS])
        UC3([Manage Inventory])
        UC4([View Low Stock Alerts])
        UC5([Manage Products Catalog])
        UC6([View Daily Sales Reports])
        UC7([View Advanced Analytics])
        UC8([Manage System Users])
    end

    S((Staff))

    %% Admin associations
    A --- UC1
    A --- UC2
    A --- UC3
    A --- UC4
    A --- UC5
    A --- UC6
    A --- UC7
    A --- UC8

    %% Staff associations
    UC1 --- S
    UC2 --- S
    UC4 --- S
    UC6 --- S
```

### Roles and Permissions

- **Staff (Cashier/Clerk):** Handles day-to-day operations. They can process sales (which automatically updates stock), check low stock alerts, and review basic daily sales reports. They do NOT have direct access to manually adjust inventory levels.
- **Admin (Manager/Owner):** Has elevated privileges. In addition to all staff capabilities, admins can manage the product catalog (add/edit/delete), manually manage inventory (stock-in/stock-out), access advanced analytics (profit margins, best sellers), and control user accounts.
