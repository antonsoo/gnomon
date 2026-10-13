# Save and reopen an editable sundial

In the source checkout, **Save design** downloads a `.gnomon.json` file.
**Open design** restores it after a reload, on another device or in another
browser. Both work offline once the application has loaded. No account,
upload, browser-storage permission or automatic location lookup is involved.

The file contains the latitude, longitude, time zone, dial type, wall angle,
plate shape, radius, clock convention and manual adjustment, numerals,
overlays, theme, motto and selected simulation minute. It includes the
location, so choose deliberately whom to share it with. Preview zoom and
scroll position are not construction settings and are not saved.

Saving while **Now** or **Animate day** is active freezes the selected minute.
Reopening pauses at that date and time; it does not recalculate the design
for today's season. This matters for automatic clock adjustment, which can
rotate the hour labels by an hour between winter and summer. A repeated local
clock time retains its earlier/later occurrence. The local time, UTC instant
and UTC offset must agree when the file is reopened. If a browser's time-zone
rules no longer agree, opening fails visibly instead of silently reinterpreting
the saved clock.

Try these files from `examples/designs/`:

| File | Editable example |
| --- | --- |
| [rome-wall.gnomon.json](../examples/designs/rome-wall.gnomon.json) | Rome, 25-degree declining wall, 180 mm radius, winter clock, temporal hours |
| [sydney-horizontal.gnomon.json](../examples/designs/sydney-horizontal.gnomon.json) | Southern hemisphere, circular 120 mm plate, no motto |
| [repeated-clock-minute.gnomon.json](../examples/designs/repeated-clock-minute.gnomon.json) | San Francisco's second 01:30 on 1 November 2026 |
| [lord-howe-half-hour.gnomon.json](../examples/designs/lord-howe-half-hour.gnomon.json) | Lord Howe's half-hour daylight adjustment |

These are constructed example settings for public locations, not measurements
of a particular wall or a record of a physically assembled instrument.

## Recovering from a failed open

Opening checks the whole file and construction geometry before changing the
current settings. Malformed or oversized files, unsupported versions, unknown
or missing fields, repeated JSON members, invalid choices and inconsistent
clock evidence leave the current design and any invalid input draft intact.
A valid file can replace an invalid draft and restore usable controls.

The limit is 16 KiB of UTF-8 JSON. A canceled read cannot replace the current
design later. Neither can an earlier read overwrite a newer file or edits made
while reading. Failed reads can be retried, including the same filename. A
read that does not finish within 15 seconds reports an error and leaves the
current settings available.

## Inputs versus a finished drawing

The format is versioned and saves editable inputs. A future version of Gnomon
may improve its geometry or rendering; opening a file then uses that version's
calculations. Keep the SVG or PDF alongside the design file when the exact
historical drawing matters. Motto text is stored instead of its position in
a menu, so rearranging the menu cannot silently choose a different motto.
An unavailable motto is an error.

This does not add physical assembly validation. Continue to check the printed
calibration bar, mounting direction, receiving face and actual wall/location
before construction. The existing [construction guide](construction.md)
explains what the drawing establishes and what needs a physical check.

The browser checks save actual files, reload, reopen offline and compare the
construction SVG bytes for all four dial types. Pure checks also compare the
gnomon SVG and A4 construction plan. These comparisons use the same build;
they are not a promise of byte-identical drawings across future releases.
The [retained workflow evidence](design-file-verification.md) records the
baseline loss of settings, actual downloads, screenshots and build checks.
This source feature has not been deployed to the hosted demo.
