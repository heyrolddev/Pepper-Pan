# Pepper Pan — the mark

Nothing in here is wired into the website. `brand/` is not `public/`, so Next
cannot serve these files even by accident; they are here so the work is not
lost, not because anything is using them.

## What it is

**A dragon made of noodle, rising out of the wok. Its eye is a peppercorn.**

The name has two words and the mark has to earn both. PAN is the wok it comes
out of. PEPPER is not sprinkled beside the creature as decoration — it is the
creature's eye, so the pepper is part of the animal rather than a label stuck
next to it. That is the trick behind Mr Peanut and the Michelin Man: the
product is the anatomy, which is what makes those marks impossible to peel
apart from their brand.

The dragon is not a costume choice. It is Taiwanese food, and a dragon is the
one figure that a child loves on sight, an adult takes seriously, and a family
recognises without being told. No other stall in Apalit will have one.

## Why it looks like this and not like the first attempt

The first attempt was a wok with a kawaii face — big oval eyes with glints,
blush cheeks, an open smile. That is the global default for generated
mascots, and it was right to reject it.

Everything here pushes the other way. The head is angular, not round: every
edge is a straight cut or a hard curve, because ovals with dots on them read
as worms and soft blobs read as clip art. There is no smile — the mouth is
the **gap between the skull and the dropped jaw**, real negative space rather
than a painted line, which is why it stays crisp at any size and on any
background. The whole head is a **single closed path**: the horn, the brow,
the snout and the open jaw are all features of one outline, so no part can
drift out of relationship with another. That was learned the hard way — drawn
as separate pieces, the jaw kept floating off the face.

Gold on red is the imperial pairing, and it is also the shop's own two
colours. On cream the gold went muddy; on red it has the impact the brief
asked for.

## Files

| File | For |
| --- | --- |
| `dragon-badge.svg` | The round badge. **The main icon** — signage, social profile, favicon. |
| `dragon-app.svg` | Rounded square, for a phone home screen. |
| `dragon.svg` | The creature and pan alone, transparent. Tarpaulin, cups, packaging, stickers. |
| `dragon-mono.svg` | One colour. Receipts, a rubber stamp, embroidery, foil. |
| `png/` | Every file above at 1024, 512 and 192px, transparent. |

The SVGs are the originals — sharp at any size, on a tarpaulin or a sticker.
Use the PNGs where something will not take an SVG (Facebook, most print
shops, Canva).

## Colours

| | |
| --- | --- |
| Gold | `#ffcf00` — the noodle, and therefore the dragon |
| Red | `#b91313` — the field |
| Warm black | `#120a08` — the pan, and the peppercorn eye |
| Iron | `#3d2620` — the rim and handle |

## Rules that matter

**Small sizes use the badge.** Below about 48px the gold creature alone loses
its edge against a pale background. The red field is what keeps it legible as
a favicon.

**Do not put the plain creature on red.** It is drawn in gold to sit ON the
red — use `dragon-badge.svg`, which already contains the field.

**One colour means one colour.** `dragon-mono.svg` has no gradients and no
mid-tones, because the shop's receipt printer is one bit per pixel: every
grey becomes solid black or nothing. The pan carries a paper-coloured halo so
it does not fuse with the dragon's tail into a single lump, and the eye is
knocked out to paper. It is drawn for dark ink on light paper — it is not a
dark-background version.

**Don't redraw the head.** The angles, the open jaw and the single swept horn
are the character. Softening any of them walks straight back to the mascot
that was rejected.

## Still to decide

- **A name.** A dragon wants one a child can shout. Worth asking a few
  customers' kids rather than deciding it here.
- **Poses.** One mark is a logo; a mascot needs a small set — coiled around a
  bowl, peeking over the counter, asleep for a closed sign. Those come after
  the face is settled.
