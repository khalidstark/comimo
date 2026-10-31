import { Composition, Folder } from "remotion";
import { SceneOnly, Walkthrough } from "./Walkthrough";
import { FPS, SCENES, totalFrames } from "./timing";

const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };

export function Root() {
  return (
    <>
      <Composition id="Walkthrough" component={Walkthrough} durationInFrames={totalFrames()} fps={FPS} {...WIDE} defaultProps={{ music: true }} />
      <Composition id="WalkthroughVertical" component={Walkthrough} durationInFrames={totalFrames()} fps={FPS} {...TALL} defaultProps={{ music: true }} />
      <Folder name="Scenes">
        {SCENES.map((scene, i) => (
          <Composition key={scene.id} id={`S${i + 1}-${scene.id}`} component={SceneOnly} durationInFrames={scene.duration} fps={FPS} {...WIDE} defaultProps={{ id: scene.id }} />
        ))}
      </Folder>
      <Folder name="ScenesVertical">
        {SCENES.map((scene, i) => (
          <Composition key={scene.id} id={`S${i + 1}-${scene.id}-V`} component={SceneOnly} durationInFrames={scene.duration} fps={FPS} {...TALL} defaultProps={{ id: scene.id }} />
        ))}
      </Folder>
    </>
  );
}
