# Rubiks-Cube-Learner (Kubi Studio)

An interactive web application to learn, practice, and explore Rubik's Cube solving online. Built primarily with **TypeScript**, **Vite**, and **Bun**, with support for mobile touch gestures, daily challenges, and high-resolution snapshot exports.

## Features

- **Interactive 3D Cube Practice:** Manipulate and learn cube moves directly in the browser with responsive controls.
- **Mobile & Touch Gesture Support:** Optimized mobile experience for smooth touch-based interaction.
- **Daily Challenge System:** Tackle recurring cube challenges via the backend server (`server.ts`).
- **High-Resolution Snapshot Export:** Capture and export clean high-resolution snapshots of cube states.

## Project Structure

```text
Rubiks-Cube-Learner/
├── src/              # Application source code and UI components
├── index.html        # Entry HTML template
├── server.ts         # Backend / daily challenge server logic
├── package.json      # Dependencies and scripts
├── bun.lock          # Bun lockfile
├── tsconfig.json     # TypeScript configuration
├── vite.config.ts    # Vite bundler configuration
└── .env.example      # Environment variable template
