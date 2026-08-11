# Frequently asked questions

This page answers common player questions about Super Bowling's controls, rules, and local
records. Use [GAME_RULES.md](GAME_RULES.md) for the complete scoring and rack contract.

## Playing the game

### Do I need a Wii Remote or a physical bowling ball?

No. Super Bowling is a browser game for one to four local players sharing a keyboard. It takes
inspiration from accessible screen bowling and arcade presentation, but it does not emulate a
motion controller, cabinet, lane hardware, sensors, tickets, or a physical ball.

### How do I bowl?

Choose power, start position, angle, and spin while aiming, then press Space. The game also
shows an on-screen control panel for pointer input. Once the ball launches, it cannot be steered.
The pre-roll preview uses the same launch limits and ball-force logic as the live shot.

### Why does a safe-looking centered shot not always strike?

The game is about technique, not finding one automatic input. Use the preview to adjust the
release board, entry angle, power, and spin so the ball reaches the pins with a productive path.

## Pins and scoring

### Why does the 1,000 option show 990 pins?

The setup labels are convenient scale names. Every rack is a complete centered triangle, so the
1,000 label creates a 990-pin rack. Scores, records, and strikes always use the actual physical
pin count. See [GAME_RULES.md](GAME_RULES.md) for every label and rack total.

### Are the pin collisions real?

Yes. The game uses a physics simulation for the ball and pins. A settled result counts pins
actually knocked down; it does not use blast-radius scoring. Fallen pins remain obstacles during
the roll, then deadwood is swept between eligible bowls while standing pins stay in place.

### When do strikes and spares apply?

Classic two-bowl frames use familiar bowling strikes, spares, and tenth-frame bonus rolls. Other
bowls-per-frame choices use Super frame scoring: they count actual pinfall without strike or
spare bonuses. [GAME_RULES.md](GAME_RULES.md) defines both modes and their score limits.

## Records and accessibility

### What does the game save?

The browser keeps recent setup choices, player names, ball designs, mute and reduced-motion
preferences, and practice records. Records stay separate for each rack scale and
bowls-per-frame choice, so a Super frame score does not replace a Classic record.

### What does Reduced motion change?

It is a saved lower-motion presentation alternative. It keeps the game information and controls
usable without redefining the normal arcade presentation; see [ACCESSIBILITY.md](ACCESSIBILITY.md)
for the complete contract.

### Is Super Bowling a copy of Wii Bowling or Lane Master?

No. It is an original game that combines familiar screen-bowling readability with an arcade
motion hierarchy, while using its own dark-teal lane, geometric interface, illustrated ball and
pin family, keyboard and pointer technique controls, physics simulation, and scoring rules.
The design boundary is described in [LANE_MASTER_VIDEO_FINDINGS.md](LANE_MASTER_VIDEO_FINDINGS.md).
