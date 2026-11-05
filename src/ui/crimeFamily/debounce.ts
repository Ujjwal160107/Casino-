// The trailing debounce of shared-card renders (spec 13.2, 14.3): the first
// event renders at once; events inside the window schedule exactly one more
// render, read from the DB when the window ends. Redis never suppresses a
// render: on a Redis error it renders anyway.
import { setNx } from "../../services/crimeFamily/activity";

/** Keys cf:render:<scope>:<id> and cf:render:<scope>:pending:<id>. */
export async function trailingRender(scope: string, id: string, windowSeconds: number, render: () => Promise<void>): Promise<void> {
  if ((await setNx(`cf:render:${scope}:${id}`, windowSeconds)) !== "held") return render();
  const pending = await setNx(`cf:render:${scope}:pending:${id}`, windowSeconds + 1);
  if (pending === "error") return render();
  if (pending === "set") {
    setTimeout(() => {
      render().catch((err) => console.error(`[crimeFamily] trailing render of ${scope} ${id} failed:`, err));
    }, windowSeconds * 1000).unref();
  }
}
