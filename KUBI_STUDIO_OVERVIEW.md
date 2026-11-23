# Kubi Studio — Interactive 3D Rubik's Cube Learning & Speedcubing Platform

> **Product Overview, Feature Guide, Solving Methods & Customization Handbook**

---

## 1. Executive Summary

**Kubi Studio** is a modern, tactile 3D Rubik's Cube learning studio and speedcubing workbench designed for every level of cuber—from first-time learners figuring out their very first white cross to experienced speedcubers drilling CFOP, Roux, ZZ/ZOLL, 4×4 parity, and Mirror Blocks.

Unlike conventional web-based Rubik's Cubes that either overwhelm beginners with cryptic notation strings or act as bare-bones 3D toys with no real teaching intelligence, Kubi Studio unites **physically based 3D realism**, **true multi-method solving algorithms**, **real-time color-coded notation tracking**, **zero-occlusion responsive ergonomics**, and **deep visual & audio personalization** in a single cohesive studio.

---

## 2. Complete Feature Inventory

### A. Tactile 3D Speedcube Engine (4 Distinct Puzzles)
- **Supported Puzzles:**
  - **2×2 Pocket Cube** — Ideal warm-up and Ortega/corner-trigger training.
  - **3×3 Classic Speedcube** — Full support for 4 solving methods, 14 guided lessons, and WCA notation.
  - **4×4 Rubik's Revenge** — Wide-layer turns (`Rw`, `Uw`), center-bar building, edge pairing, and PLL parity training.
  - **Mirror Blocks (Bump Cube)** — Asymmetric brushed-metal geometric puzzle solved purely by piece height and silhouette instead of color.
- **Physically Based Rendering (PBR) & Mechanical Realism:**
  - Three-point studio lighting with rounded beveled cubie chassis, glossy clearcoat raised tiles, subtle studio plinth ring, and dynamic contact shadow.
  - **Internal 6-Axis Machined Spider Core & Exploded View (0–100%):** Smoothly separates cubies radially so learners can inspect internal cube mechanics and trace hidden pieces on back faces.
  - **Magnetic Speedcube Kinematics & Audio:** Snappy magnetic detent easing on every turn paired with synthesized tactile click/morph audio and adjustable **Animation Tempo (`0.6×` to `2.0×`)**.
- **Precision Controls (Touch, Mouse & Full WCA Keyboard):**
  - **Drag-Locked Layer Swiping:** Dragging directly on a cube face rotates strictly that layer—never accidentally spinning the whole cube camera mid-turn. Dragging outside the cube orbits smoothly (with 2-finger pinch zoom on mobile/tablet).
  - **Complete WCA Move Set:** Outer faces (`U, D, L, R, F, B`), center slices (`M, E, S`), whole-cube rotations (`x, y, z`), `4×4` wide turns (`Rw, Uw`), plus `Shift` / `Prime (')` toggle for counter-clockwise turns.

---

### B. Multi-Method 3×3 Solving Engine & Live Method Flow Stepper
Rather than simply rewinding your scramble history backwards, Kubi Studio analyzes the **actual live 3D sticker state** (even after `M/E/S` slice turns, `x/y/z` cube rotations, or arbitrary manual moves) and builds a structured, phase-by-phase solve plan using **four authentic speedcubing methods**:

| Solving Method | Stage Flow | Best For | Key Learning Benefit |
| :--- | :--- | :--- | :--- |
| **Beginner (LBL)** | White Cross → 1st Layer Corners → 2nd Layer Edges → Top Cross → Corner Placement → Corner Twist | First-time solvers & casual learners | Intuitive layer-by-layer structure using small, memorable triggers (`R U R' U'`, Niklas). |
| **CFOP (Fridrich)** | Cross → F2L (4 Corner-Edge Pairs) → OLL → PLL | Aspiring & competitive speedcubers | World-record speedcubing method; shows exact F2L pair slots and OLL/PLL recognition cases. |
| **Roux** | First Block (`1×2×3`) → Second Block (`1×2×3`) → CMLL → LSE (`<M, U>`) | Intuitive block-builders & low-movecount fans | Minimizes cube rotations and teaches powerful `<M, U>` middle-slice fluency. |
| **ZZ / ZOLL** | EOLine (Edge Orientation + Line) → ZZF2L → ZOLL → EPLL | Ergonomic `<R, U, L>` solvers | Orients all 12 edges up front so the rest of the solve requires zero awkward rotations and guarantees an oriented top cross. |

- **Live Method Flow Stepper:** Displays every phase as an interactive progress pipeline (`Completed ✓` → `Active Stage (move count)` → `Upcoming`) along with the exact active sub-algorithm name and goal description.
- **Full Playback Control:** Learners can **Step** one move at a time, watch **Auto-Solve** smoothly animate the method, **Pause** at any exact phase to inspect the cube, switch methods mid-solve, or click **Re-plan** to recalculate from any modified cube state.

---

### C. Guided Interactive Learn Curriculum (23 Verified Lessons)
Every lesson stages the exact starting case on the 3D cube and pairs it with an **instant, zero-delay 3D directional guide arrow** that advances immediately after each correct turn:
- **3×3 Method-Curated Curriculum (14 Lessons, filterable by method):**
  - *Beginner:* First Layer Corner Insert, Middle Layer Edge Right, Top Cross (`F R U R' U' F'`), Position Top Corners (Niklas).
  - *CFOP:* F2L Pair & Slot, OLL Sune (OLL 27), PLL T-Perm, PLL Jb-Perm.
  - *Roux:* CMLL Chameleon (T-Case), LSE 4a Arrow EO (`<M, U>`), LSE Ua-Perm (`<M, U>`).
  - *ZZ / ZOLL:* ZOLL H-Case (OLL 21), ZZ EPLL H-Perm, ZZ EPLL Z-Perm.
- **2×2 Curriculum (3 Lessons):** Corner Trigger, Orient Yellow Top (Sune), Swap Adjacent Corners (T-Perm).
- **4×4 Curriculum (3 Lessons):** Center Bar Alignment, Slice-Flip-Slice Edge Pairing, 4×4 PLL Parity Fix.
- **Mirror Blocks Curriculum (3 Lessons):** Silhouette & Height Reading, Flush Top Cross, Sculptural Corner Leveling.
- Each lesson supports **Stage Case**, **Step**, **Play Demo**, move-by-move coaching tips, and live green/red move verification.

---

### D. Live Color-Coded Notation & Scramble Tracker
- **Type or Track Any Sequence:** Paste or type any WCA scramble or custom algorithm (e.g., `U D L F R M E S x y z`) or click **Practice Scramble** to execute a scramble step by step.
- **Instant Color Feedback as You Turn:**
  - **Highlighted Accent Box:** Active next expected move (clickable to execute).
  - **Green Box (`✓`):** Move performed correctly—immediately advances the tracker and updates the 3D guide arrow.
  - **Red Box (`×`):** Wrong move performed—shows exactly what was played vs. expected, with a one-tap **Undo** recovery link.
  - **Half-Turn Indicator (`½`):** Tracks 180° double moves (`U2`, `R2`, etc.) cleanly whether performed as one `U2` or two sequential `90°` turns.

---

### E. Unobstructed Multi-Device Workspace & Compact Mini-Bar
- **Zero Cube Occlusion Across Every Screen:**
  - **Desktop & Wide Tablets (`>= 1024px`) & Short Mobile Landscape:** Clean side-by-side split—spacious 3D cube stage on the left, collapsible Studio Controls Panel on the right.
  - **Mobile Portrait & Narrow Tablets:** Non-overlapping stacked workspace—compact top header, dedicated unobstructed top 3D stage, and bounded scrollable controls drawer below.
  - **Exact Bounding-Sphere 3D Auto-Framing:** Dynamically computes camera distance from both vertical and horizontal FOV whenever the viewport resizes, keeping the full cube, bottom layer, plinth ring, 3D guide arrows, and exploded cubies centered while preserving your custom orbit angle.
- **Persistent Compact Mini-Bar (Collapsed Controls Mode):**
  - Hiding the controls panel frees ~85% of the screen for large-scale 3D manipulation while docking a slim, non-overlapping notation strip cleanly beneath the cube.
  - Keeps active method stage / lesson progress, live auto-scrolling green/red notation markers, and quick **Step**, **Auto-Solve/Pause**, **Undo**, and **Controls** actions visible at all times.
- **Interactive, Context-Aware First-Session Mini-Bar Tooltips:**
  - Automatically guides first-time learners through reading the Mini-Bar (`Notation Markers` → `Solve Context` → `Quick Controls`) with spotlight rings, a live color/symbol legend, and a plain-English translation of their exact next move (e.g., *"`R'`: Turn Right face 90° counter-clockwise"*).
  - Replayable anytime via the `?` icon, plus instant hover/focus/tap micro-tooltips on every individual notation chip.

---

### F. Speedcubing Timer, Analytics Dashboard & Daily Challenge
- **Built-in Speedcube Stopwatch (`T`):** WCA-style hold-to-ready timing, official scramble generator, `+2` and `DNF` penalty toggles, move-count recording, and one-tap **Apply Scramble to 3D**.
- **Session Statistics & Progress Analytics:**
  - Tracks Personal Best (PB), Mean, **Ao5**, **Ao12**, and solve distribution histograms.
  - **Analytics Tab:** Interactive dual-metric line chart visualizing **Solve Time**, **Move Count**, and **Turns Per Second (TPS)** across your **last 20 solves** so you can clearly see improvement over time.
- **Daily Challenge & Leaderboard:** Deterministic UTC daily scramble for each puzzle with countdown timer, direct 3D play integration, and ranked leaderboard.

---

### G. Deep Personalization, Exports & Productivity Tools
- **4 Curated Built-in Studio Themes:**
  - *Atelier Light* (Swiss Studio) · *Monolith Dark* (Obsidian Pro) · *Bento Pastel* (Soft Tactile) · *Cyber Graphite* (Neon Industrial).
- **Live Sticker Palette Studio (Figma-Inspired):**
  - Customize every individual face sticker color (`U, D, F, B, R, L`), chassis finish (`Carbon`, `Ceramic`, `Graphite`, or custom hex), and UI accent color with **instant live 3D preview** right beside the unobstructed cube.
  - Includes 4 designer starter palettes (**Figma Spectrum**, **Swiss Bauhaus**, **Tokyo Matcha**, **Braun Atelier**) plus unlimited saved custom themes.
- **Procedural Ambient Focus Soundscapes:**
  - Synthesized Web Audio soundscapes (**Rainy Studio**, **Lo-fi Beats**, **White Noise**, or **Off**) with independent volume control and persistent user preferences.
- **High-Resolution PNG Cube Snapshot:** Exports a crisp, high-resolution PNG (up to `2400×1800`) of your exact current cube state, stickers, theme, exploded core, and camera angle—zero UI clutter.
- **Full JSON Backup & Import:** Export all custom themes and solve records to a portable `.json` file and restore or merge them back anytime using local storage.
- **Interactive Keyboard Shortcuts Overlay (`?`):** Compact reference card showing `U/D/L/R/F/B`, `M/E/S`, `x/y/z`, `Shift` for prime, and studio shortcuts—every key is also clickable to test the turn immediately.
- **Victory Celebration & Solve Coach:** Lightweight canvas confetti burst on completing a solve, plus a built-in Solve Coach Q&A tab for cube theory, fingertricks, and parity questions.

---

## 3. What Makes Kubi Studio Special Compared to Other Cube Websites?

| Capability | Typical Online Rubik's Cube Sites | Kubi Studio |
| :--- | :--- | :--- |
| **Solving Intelligence** | Reverses your scramble moves blindly (teaches nothing about real solving). | **True state-based multi-method solver** (`Beginner`, `CFOP`, `Roux`, `ZZ / ZOLL`) with a live phase pipeline and sub-algorithm explanations. |
| **3D Viewport & Mobile UX** | Floating panels cut off the bottom of the cube; hiding controls hides notations too. | **Non-overlapping responsive split/stacked workspace** + exact bounding-sphere auto-framing + **persistent Compact Mini-Bar** when collapsed. |
| **Notation Tracking** | Static plain text strings; easy to lose your place or miss a mistake. | **Live green (`✓`) / red (`×`) / half-turn (`½`) tracker** that reacts to swipes, clicks, and keyboard moves with instant **Undo** recovery. |
| **3D Guidance** | Static text instructions or delayed hints that require re-clicking. | **Zero-delay 3D directional guide arrow** that jumps straight to the next move immediately after every correct turn. |
| **Touch & Layer Ergonomics** | Swiping a layer often spins the whole cube accidentally. | **Capture-phase layer drag lock** isolates face turns cleanly from camera orbit, plus full `M/E/S` slice and `x/y/z` rotation support. |
| **Beginner Onboarding** | Assumes you already know WCA notation (`R'`, `U2`, `M`). | **Context-aware first-session tooltips** and per-chip notation inspectors translate every symbol into plain English right where you look. |
| **Visual Customization** | Fixed classic colors or basic light/dark toggle only. | **4 studio themes + Live 3D Sticker Palette Studio** (custom hex per face, chassis presets, designer palettes) + **Exploded Core X-Ray View**. |
| **Focus Environment** | Silent or repetitive click sound only. | **Built-in Ambient Soundscapes** (*Rainy Studio*, *Lo-fi Beats*, *White Noise*) alongside magnetic speedcube tactile audio. |
| **Puzzle Variety** | Usually 3×3 only. | **4 distinct 3D puzzles** (`2×2`, `3×3`, `4×4`, and asymmetric geometric **Mirror Blocks**) with dedicated lessons for each. |
| **Portability & Sharing** | Progress trapped in one browser session; manual screenshots include UI clutter. | **JSON Backup/Import** for themes & solve records + **High-Res clean PNG Cube Snapshot** + 20-solve **Analytics** line chart. |

---

## 4. Why Users Find Kubi Studio Friendly & Easy to Use

### 1. Zero-Intimidation Entry for Beginners
- **Visual First, Notation Second:** Learners don't need to memorize WCA notation before turning the cube. The **3D guide arrow** shows the exact physical direction on the cube, while the **Mini-Bar interactive tooltips** explain symbols like `R'`, `U2`, and `M` in plain English the moment they appear.
- **Forgiving Mistake Recovery:** Make a wrong turn in `Learn` or `Play & Solve`? The active chip immediately highlights **red (`×`)**, tells you what move was expected, and surfaces a single-tap **Undo** button—so you never get lost mid-algorithm.
- **Exploded View Clarity:** Struggling to see where a piece moved on the back or bottom face? Drag the **Exploded Core** slider to gently separate the pieces in 3D space without breaking your solve state.

### 2. Effortless Ergonomics on Every Device
- **Phones, Tablets & Desktops Treated Equally:** Whether holding a phone one-handed in portrait, rotating into landscape, practicing on an iPad, or speed-drilling with a keyboard on a widescreen desktop, the cube stays 100% unobstructed and comfortably sized.
- **Distraction-Free Solving Without Blindness:** Collapsing the controls panel gives you a wide-open 3D cube canvas while the **Compact Mini-Bar** keeps your method stage, scrolling move tracker, and `Step`/`Undo` controls right below your thumb.

### 3. Smooth Growth Path from First Solve to Speedcubing
- **Learn at Your Own Pace:** Start with the 4 Beginner lessons (`Layer-by-Layer`) using slow `0.7×` animations and step-by-step hints.
- **Graduate Seamlessly to Advanced Methods:** Switch the **Method Selector** to `CFOP`, `Roux`, or `ZZ / ZOLL` on the exact same scrambled cube to compare how each method approaches the same state—watching the **Method Flow Stepper** highlight Cross, F2L, CMLL, LSE, EOLine, or ZOLL in real time.
- **Measure Real Mastery:** Transition to the built-in **Stopwatch**, tackle the **Daily Challenge**, and watch your move count drop and TPS climb in the **Last-20 Solves Analytics** chart.

### 4. Make the Studio Feel Truly Yours
- Create colorblind-friendly, pastel, monochrome, or high-contrast sticker palettes in seconds with live 3D previews.
- Turn on **Rainy Studio** or **Lo-fi Beats** for relaxed evening practice sessions.
- Back up your personal themes and solve history to JSON anytime, and capture clean high-resolution PNG snapshots of favorite patterns (Checkerboard, Cube-in-Cube, Mirror Blocks sculptures) to share with friends.

---

*Kubi Studio — Built for clarity, tactile precision, and joyful mastery of twisty puzzles across every device.*
