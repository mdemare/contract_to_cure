# Add Geographic Board Backdrop

## What went right

The board now has a restrained vector world map aligned to the same 1,300-pixel coordinate panel as its cities. A single background element repeats across all three horizontal panels inside `map-inner`, so land, graticules, ocean depth, routes, and cities share one pan-and-zoom transform and cross the wrap boundary without a separate synchronization path. The external SVG remains sharp at high pixel densities while adding less than five kilobytes to the page.

Connections and game pieces retain explicit higher stacking layers, and the backdrop ignores pointer input and assistive technology. Browsers requesting reduced data, devices reporting at most two gigabytes of memory, and slow-update displays receive a simplified CSS approximation that avoids fetching and rendering the detailed SVG.

Regression coverage verifies the shared transformed container, exact wrap dimensions, layer order, non-interactivity, vector viewport, and constrained-device switches. The complete Rake suite passed with 126 tests and 714 assertions.

## What went wrong

The focused test initially used Ruby's optional REXML library, which this dependency bundle does not include. Replacing that parser with a direct SVG-root assertion kept the test dependency-free.

The repository has no browser-level viewport or screenshot harness. Source tests protect the coordinate, wrap, sizing, and fallback contracts, but they cannot visually compare the backdrop at wrapped edges or at representative desktop and mobile aspect ratios. A follow-up test ticket records that remaining verification gap.

## Final thoughts

Keeping the cartography in board coordinates is the important architectural choice: responsive clipping changes how much of the board is visible, but never rescales the geography independently of cities. The low-contrast vector treatment gives the route network spatial context without competing with labels and pieces, while the simplified fallback preserves the overall world silhouette on constrained devices.
