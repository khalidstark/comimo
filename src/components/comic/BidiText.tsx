import { splitBidiRuns } from "@/lib/bidi";

/**
 * Text that may mix Arabic and English. Each language run is isolated in a
 * <bdi> so punctuation stays with the words it follows (ISS-001); one-language
 * text renders as plain text.
 */
export function BidiText({ text }: { text: string }) {
  const runs = splitBidiRuns(text);
  if (runs.length < 2) return <>{text}</>;
  return (
    <>
      {runs.map((run, i) =>
        run.dir ? (
          <bdi key={i} dir={run.dir}>
            {run.text}
          </bdi>
        ) : (
          run.text
        ),
      )}
    </>
  );
}
