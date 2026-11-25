# Oamaru 1914 - Ford Model T Simulation

## Game Concept

**Oamaru 1914** is a realistic 3D simulation of driving a 1914 Ford Model T through the Victorian-era streets of Oamaru, New Zealand. The project blends accurate historical recreation with playful period humor, creating an immersive "living history" experience where players learn to master the unique planetary transmission of the Model T while navigating authentic period road conditions.

### Core Gameplay Loop
1. **Start the Model T** - Crank the engine, advance the throttle, engage the planetary gear shift
2. **Navigate Oamaru's streets** - Deal with varying road surfaces, cobblestones, wet roads, and period traffic
3. **Complete errands** - Pick up/drop off passengers, make deliveries, or just explore
4. **Experience the season/weather** - Clear summer days, rainy afternoons, or crisp winter mornings
5. **Master the physics** - Planetary gearbox, clutch-less shifting, torque curve, and hill starts

## Scene & Setting

### Location: Oamaru, New Zealand (1914)
- **Victorian Whitestone precinct**: Distinctive limestone buildings
- **Harbour district**: Working port with ships, warehouses, dock activity
- **Residential streets**: Period houses, shops, cabbage tree palms (Cordyline australis)
- **Key landmarks**: Harbour, main commercial district, residential avenues

### Time Period
- **1914**: Peak Model T production era
- **Edwardian era**: King George V reign, pre-WWI
- **Horse-and-buggy coexistence**: Streets shared with horse-drawn carts, carriages

### Weather & Atmosphere
- **Clear summer days**: Bright sunlight, warm stone, lively streets
- **Rainy afternoons**: Wet roads, reflective surfaces, umbrellas, reduced visibility
- **Snowy mornings**: Crisp air, snow-dusted roofs, steam from breath
- **Dusk/night**: Streetlamps lighting, shopfronts glowing, darker streets

## Tone & Humour

### Dead-Pan Humour
The game employs a **dead-pan, understated British/New Zealand humour** - things are presented matter-of-factly, even when absurd. This is reflected in:

- **Pedestrian interactions**: "Lovely day for a walk," says the man umbrella-less in a downpour
- **Traffic situations**: "Cars queueing behind a horse-drawn cart. Progress, old chap?"
- **Weather commentary**: "Typical Oamaru. Four seasons in one morning."
- **Model T quirks**: "If the engine doesn't catch, don't panic. Try again. And again."

### Period-Accurate Elements (with Humorous Twist)
- **Hats**: Everyone wears hats. Even the dogs have tiny hats (optional easter egg)
- **Technology**: Electric lights are newfangled; gas lamps still common
- **Social norms**: Gentlemen tip hats, ladies curtsey, constables direct traffic
- **Vehicle limitations**: 20 mph top speed, no power steering, manual advance/retard

### Humour Types
1. Gentle satire of Edwardian social hierarchies
2. Technical absurdities of early automotive technology
3. Local colour: Oamaru-specific references (limestone, wool, farming)
4. Character interactions: Dead-pan exchanges with NPCs

## Purpose & Goals

### Primary Purpose
Create an **educational and entertaining simulation** that teaches players about:
- Early automotive technology (Model T operation)
- Victorian/Edwardian urban design
- Historical Oamaru streetscape
- Period-accurate driving physics

### Secondary Goals
- **Preserve digital**: Capture Oamaru's Victorian streets in interactive form
- **Accessible history**: Make local history engaging for all ages
- **Skill-based gameplay**: Mastering gear shifting is the core challenge
- **Relaxed exploration**: No time pressure, just driving and observing

### Player Goals
1. **Learn the Model T**: Master the three pedals (brake, clutch/throttle combine), lever-based gear shift
2. **Navigate challenges**: Rain-slick cobblestones, horse-drawn traffic, fog
3. **Complete routes**: Between landmarks in Oamaru
4. **Collect observations**: Photograph interesting buildings, note weather changes
5. **Earn achievements**: "First start," "Rainy day driving," "Harbour master"

## Historic City of Oamaru

### Geography
- **North Otago coast**: South Pacific location
- **Whitestone architecture**: distinctive local limestone buildings
- **Harbour**: Important port for wool, gold, and agricultural exports
- **Town layout**: Grid pattern with main commercial street running parallel to harbour

### Key 1914 Features
- **Cobbled side streets**: Main roads macadam, side streets often cobble or dirt
- **Street layout**: Narrower than modern; buildings close to sidewalk
- **Gas lighting**: Many streets still gas-lit, some electric
- **Horse traffic**: Significant; carts, drays, milk floats
- **Tram lines**: May be present on main thoroughfares
- **Water pumps**: Public pumps on street corners
- **Corrugated iron**: Common roofing and outbuilding material

### Notable Streets
- **Harbour Street**: Main thoroughfare, parallel to waterfront
- **Wanbrow Street**: Residential, gentle grade
- **Oak Street**: Rises toward higher town
- **Terrace Street**: Terraced housing

## Technical Implementation Choices

### Rendering & Graphics
- **Three.js based**: 3D web graphics framework
- **ACES color management**: Cinematic color grading
- **Physical materials**: Whitestone, brass, enamel, wood textures
- **Shadow mapping**: 2048² orthographic, biased ahead of camera
- **Height fog**: Density varies by area (denser near harbour)
- **Night exposure**: Shops and streetlamps carry the scene

### Physics & Simulation
- **Planetary transmission**: Authentic Model T gear system
  - Low gear: Forward, cruising
  - Reverse: For backing
  - High gear: Speed cruising
- **No synchromesh**: Requires throttle blip for gear changes
- **Planetaries**: Sun-planet-ring gear system
- **Surface-dependent traction**: Cobbles wet/dry, macadam variability

### Traffic & NPCs
- **Period-appropriate density**: Not modern gridlock
- **Horse-drawn vehicles**: Shared road space
- **Pedestrians**: Stylized but period-accurate clothing
- **Dynamic weather effects**: Wet roads, reduced traction

### Audio
- **Period-appropriate sound**: No electronic music
- **Engine sounds**: Period-correct flathead 4-cylinder
- **Environmental**: Horse hooves, carriage wheels, street sounds
- **Minimal UI sounds**: Subtle feedback only

### Controls
- **Keyboard**: Arrow keys for steering, Shift+Arrow for head look
- **Cockpit mode**: First-person view with dash instrumentation
- **Mouse**: Look around, interact with crank
- **Gamepad**: Supported for driving

## Development History

### Project Milestones
- **Initial commit**: Basic Model T geometry and terrain
- **Visual pass plan**: Ordered rendering improvements (PLAN.md)
- **Fixes audit**: 12 technical fixes for physics, rendering, AI
- **Race system**: Pre-race vs racing blockades distinction
- **Mobile support**: Touch controls and expanded map

### Current Focus
- Traffic system with period blockades
- Weather and seasonal transitions
- Physics refinement for Model T handling
- Visual polish per the visual pass plan

## Future Considerations

### Potential Features
- **Errand system**: Pick up/drop off passengers/freight
- **Weather impacts**: Rain affecting traction, snow changing road appearance
- **Time of day**: Dawn, day, dusk, night with different NPC populations
- **Vehicle customization**: Period-correct accessories (horn, lamps, etc.)
- **Photo mode**: Capture and share screenshots
- **Historical tours**: Guided routes with information plaques

### Expansion Ideas
- **Surrounding countryside**: Beyond Oamaru town boundaries
- **Other Model T models**: Touring, runabout, delivery variants
- **Seasonal events**: Christmas decorations, harvest festival
- **Multiplayer**: Cooperative or competitive driving
- **Museum integration**: Connection to real Oamaru heritage

## Design Principles

1. **Historical authenticity**: Period-accurate where it doesn't compromise gameplay
2. **Accessibility**: Easy to learn, hard to master (the Model T gear shift)
3. **Relaxed pacing**: No failure states from time limits, only from physics challenges
4. **Dead-pan humour**: Understated, character-driven comedy
5. **Performance-first**: Runs in browser, target 60fps on modern devices
6. **Progressive disclosure**: Teach mechanics gradually rather than overwhelming
7. **Local character**: Oamaru-specific details, not generic historical fiction
