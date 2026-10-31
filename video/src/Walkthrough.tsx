import type { ComponentType } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { Grade, Sfx } from "./components/core";
import { TransitionOut } from "./components/Transitions";
import { CheckIn } from "./scenes/CheckIn";
import { Finale } from "./scenes/Finale";
import { Hook } from "./scenes/Hook";
import { NewFaces } from "./scenes/NewFaces";
import { PageBuild } from "./scenes/PageBuild";
import { Photos } from "./scenes/Photos";
import { Record } from "./scenes/Record";
import { Storyteller } from "./scenes/Storyteller";
import { C } from "./theme";
import { OVERLAP, SCENES, sceneStarts, totalFrames, type SceneId } from "./timing";

export const SCENE_COMPONENTS: Record<SceneId, ComponentType> = { Hook, Record, Storyteller, NewFaces, Photos, PageBuild, CheckIn, Finale };

/** The music bed's level: quiet under the check-in, up for the finale, out at the end. */
function bedVolume(frame: number): number {
  const starts = sceneStarts();
  const checkIn = starts[SCENES.findIndex((s) => s.id === "CheckIn")];
  const finale = starts[SCENES.findIndex((s) => s.id === "Finale")];
  const end = totalFrames();
  return interpolate(
    frame,
    [0, 20, checkIn - 10, checkIn + 20, finale - 10, finale + 20, end - 60, end],
    [0, 0.32, 0.32, 0.16, 0.16, 0.4, 0.4, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

/** One scene on its own (for the demo cut), with the grade but no bed. */
export function SceneOnly({ id }: { id: SceneId }) {
  const Scene = SCENE_COMPONENTS[id];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Scene />
      <Grade />
    </AbsoluteFill>
  );
}

/** The whole walkthrough: scenes overlap while each page turns or wipes into the next. */
export function Walkthrough({ music = true }: { music?: boolean }) {
  const starts = sceneStarts();
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {SCENES.map((scene, i) => {
        const Scene = SCENE_COMPONENTS[scene.id];
        return (
          <Sequence key={scene.id} name={scene.id} from={starts[i]} durationInFrames={scene.duration} style={{ zIndex: SCENES.length - i }}>
            <TransitionOut kind={scene.out} duration={scene.duration} overlap={OVERLAP}>
              <Scene />
            </TransitionOut>
          </Sequence>
        );
      })}
      {SCENES.map((scene, i) =>
        scene.out === "none" ? null : (
          <Sfx key={`t${scene.id}`} at={starts[i] + scene.duration - OVERLAP} name={scene.out === "turn" ? "flip" : "whoosh-short"} volume={scene.out === "turn" ? 0.55 : 0.45} />
        ),
      )}
      {music ? <Audio src={staticFile("own/sfx/bed.wav")} volume={bedVolume} /> : null}
      <Grade />
    </AbsoluteFill>
  );
}
