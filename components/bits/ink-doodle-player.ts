import lottie from "lottie-web/build/player/lottie_light";

/**
 * InkDoodle's player, in a chunk of its own: lottie-web's light build (SVG
 * renderer, no expressions) and the drawing's JSON, fetched together when a
 * doodle nears the screen. Draws it once into `stage` and holds the last
 * frame. Resolves with a function that tears it down.
 */
export async function drawDoodle(stage: HTMLElement, src: string): Promise<() => void> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`${src}: ${response.status}`);
  const animationData = await response.json();
  const animation = lottie.loadAnimation({
    container: stage,
    renderer: "svg",
    loop: false,
    autoplay: true,
    animationData,
    rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
  });
  return () => animation.destroy();
}
