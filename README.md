<<<<<<< HEAD
# A* Algorithm & City Route Pathfinder Platform

An interactive algorithm visualization and geographic pathfinding suite built for **Design and Analysis of Algorithms (DAA)**. Backed by an embedded SQLite database and a high-performance REST API.

---

## 🚀 Features

### 1. Interactive Maze Grid Visualizer
- **Dynamic Grid**: Click and drag to create or erase walls and obstacles in real-time.
- **Start (S) & Goal (G)**: Relocatable origin and destination points.
- **Autonomous Character Traversal**: Character agent (🤖) smoothly animates along the calculated optimal path once found.
- **Visual Wave Animation**: Closed set nodes expand in ripple waves, followed by gold-highlighted shortest path cells.
- **Presets**: Instant sample maze generator, random wall scatter, and grid reset.

### 2. Heuristics & Live Metric Analytics
- **Manhattan Heuristic Button ($L_1$ Norm)**:
  $$h(n) = |x_1 - x_2| + |y_1 - y_2|$$
  Optimal and strictly consistent for 4-directional orthogonal grids.
- **Euclidean Heuristic Button ($L_2$ Norm)**:
  $$h(n) = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}$$
  Calculates straight-line geometric distance.
- **Real-Time Display Metrics**:
  - **Path Cost ($g$)**: Total accumulated movement cost to target.
  - **Nodes Explored**: Closed set cardinality.
  - **Path Length**: Number of steps from Start to Goal.
  - **Execution Time**: Solver computation speed in milliseconds.

### 3. Side-by-Side Heuristic Comparison
- Compare both heuristics on the **exact same maze layout**.
- Side-by-side modal displaying:
  - Manhattan vs. Euclidean nodes explored
  - Path length & cost verification (both guarantee optimality)
  - Execution runtime (ms)
  - Algorithmic analysis explaining which heuristic pruned more nodes and why.

### 4. City Road Network Map Pathfinder
- Scale A* from discrete grids to weighted bidirectional road networks.
- 10 metropolitan landmarks (University, Airport, Tech Park, Central Station, Medical Center, Harbor, Mall, Stadium, Logistics Zone, Gardens).
- Visual turn-by-turn navigation steps and animated transit marker along the computed shortest highway/arterial route.

### 5. Working Pricing & Subscription Backend
- Three subscription tiers: **Starter (Free)**, **Pro Developer ($29/mo)**, and **Enterprise ($99/mo)**.
- Monthly & Annual billing switchers.
- Connected to SQLite backend via `POST /api/pricing/subscribe` which updates user account tiers directly in `beacon.db`.
- Dedicated pricing page: [pricing.html](file:///c:/Users/Ankit/OneDrive/Desktop/daa/pricing.html).

### 6. Comprehensive Documentation & Live API Explorer
- Complete mathematical proofs and formulations of A*, admissibility, and monotonicity.
- Live REST API Console to test all endpoints from the browser.
- Dedicated documentation page: [docs.html](file:///c:/Users/Ankit/OneDrive/Desktop/daa/docs.html).

---

## 🛠️ REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/astar/solve` | Solves grid pathfinding with selected heuristic |
| `POST` | `/api/astar/compare` | Compares Manhattan vs. Euclidean heuristics |
| `GET` | `/api/map/graph` | Returns metropolitan road graph nodes & edges |
| `POST` | `/api/map/route` | Solves shortest driving path between two landmarks |
| `GET` | `/api/pricing/plans` | Fetches subscription tiers from SQLite |
| `POST` | `/api/pricing/subscribe` | Upgrades/changes user subscription tier |
| `GET` | `/api/pricing/my-subscription` | Fetches active subscription for user |
| `GET` | `/api/docs` | Retrieves documentation articles and guides |
| `GET` | `/api/incidents` | Lists monitored microservice incidents |

---

## 💻 How to Run

1. Double-click `start.bat` or run in terminal:
   ```powershell
   .\node.exe server.js
   ```
2. Open your browser at:
   - **Main App & Maze Visualizer**: [http://localhost:3000](http://localhost:3000)
   - **Documentation**: [http://localhost:3000/docs.html](http://localhost:3000/docs.html)
   - **Pricing**: [http://localhost:3000/pricing.html](http://localhost:3000/pricing.html)
   - **Dashboard**: [http://localhost:3000/dashboard.html](http://localhost:3000/dashboard.html)
=======
# A*-Algorithm
>>>>>>> e632752286d8f56d138192404318471fc49c8ec3
