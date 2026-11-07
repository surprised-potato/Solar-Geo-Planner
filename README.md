# Solar Geo Planner ☀️📐

A high-performance geospatial solar CAD design and PV stringing tool built with TypeScript, Vite, and Leaflet. Designed to plot solar arrays directly on high-resolution satellite imagery with precision geometry, automated stringing, PEC electrical calculations, and realistic rooftop racking.

---

## 🛤️ Roof Rails Racking Architecture

Solar rooftop racking systems follow structural mounting principles where **roof rails are always laid out parallel to the short side of the solar panel**:

### 1. Orientation & Rail Alignment
- **Portrait Orientation**:
  - The short side of the solar panel is horizontal (along the array row / East-West axis).
  - **Rails run horizontally along rows**, spanning continuously under adjacent modules.
  - Clamping is applied along the module's long frames.
- **Landscape Orientation**:
  - The short side of the solar panel is vertical (along the roof slope / North-South axis).
  - **Rails run vertically along columns / up-down the slope**, spanning continuously down each column.
  - Clamping is applied along the module's long frames.

### 2. Parallel Rails Configuration (2 vs. 3 Rails)
- **2 Rails in Parallel (Standard)**:
  - 1 rail positioned near each end of the panel (at 20% and 80% of module length).
  - Optimizes structural cantilever and clamp zone compliance for standard wind loads.
- **3 Rails in Parallel (Heavy Load / Wide Modules)**:
  - 1 rail near each end (at 18% and 82%) **plus an additional structural rail at the center (50%)**.
  - Prevents module sagging, glass deflection, and micro-cracking under heavy wind uplift, high snow loads, or extra-large commercial modules (>2.2m).

### 3. Spacing & Setback Integration
- **Along-Rail Module Gap**: Mid-clamp spacing between adjacent modules sharing the same rail (typically 15mm – 25mm, default 20mm).
- **Across-Rail Row/Col Pitch**: Clearance between parallel rows or columns of panels, supporting auto-calculated shadow clearance angles.
- **Rail Cantilever Overhang**: Configurable rail extension (default 10cm) past the outer modules of each run.
- **Boundary Setbacks**: Perimeter buffers (e.g. 0.5m gutter setback, 0.9m NFPA 1 fire code ridge setback) guarantee that both module glass and rail cantilevers remain safely within roof structural boundaries.
- **Contiguous Run Segmentation**: Obstacles and keep-out polygons automatically split rail lines into independent continuous structural spans with proper end overhangs on each segment.

---

## 🗺️ View Filters & CAD Visualization

The interactive map CAD canvas includes high-fidelity rendering for roof rails:
- **Aluminum Rail Beams**: Crisp silver-blue rail lines (`#38bdf8` / `#94a3b8`) rendered with exact scale, cantilever tips, and interactive length/panel tooltips.
- **Roof Anchor Brackets (L-Feet)**: Micro attachment anchor markers rendered at rafter/purlin attachment points under each module when zoomed in.
- **View Presets**:
  - **🌟 Full CAD**: All layers enabled (Panels, Rails, Mount Tables, String Wiring, Homeruns, Edit Handles).
  - **☀️ Panel View**: Panels and roof rails visible with edit handles and wires hidden for a clean look.
  - **📐 Civil Layout**: Emphasizes roof rails, ground mount tables, setbacks, slope arrows, and vertices.
  - **🎨 Presentation**: Clean proposal aesthetic showing panels, roof rails, and raceways without handles.
  - **⚡ Wires Only**: Dims panels and hides rails to spotlight DC electrical string circuits.
  - **🔍 Tracing**: Hides panels and rails to trace satellite roof features.
- **Interactive Checkbox**: Toggle `Roof Rails` independently from the Ribbon **Views** tab or status bar.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Running Locally
```bash
npm run dev
```

### Running Tests
As specified in `run_tests.txt`:
```bash
npm test
```

### Building for Production
```bash
npm run build
```

---

## 🚀 Deployment & Hosting

### Firebase Hosting
Live deployment URL: **[https://solar-geo-prt.web.app](https://solar-geo-prt.web.app)** (and `https://solar-geo-prt.firebaseapp.com`)

To deploy updates to Firebase:
```bash
npm test
npm run build
npx firebase-tools deploy --only hosting
```

---

## 📦 Repository
Source code on GitHub: [surprised-potato/Solar-Geo-Planner](https://github.com/surprised-potato/Solar-Geo-Planner)
