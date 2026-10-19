import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { useDaemonsStore } from "@/lib/daemons/store";
import { wrapper } from "@/test/render";
import { server } from "@/test/server";
import { useConversation } from "./use-conversation";

it("loads the latest items and stays idle when disabled", async () => {
  useDaemonsStore.setState({ daemons: [] });
  useDaemonsStore
    .getState()
    .add({ name: "a", url: "http://a.test", token: "t" });
  const id = useDaemonsStore.getState().daemons[0].id;
  server.use(
    http.get("http://a.test/v1/sessions/cse_1/conversation", ({ request }) =>
      HttpResponse.json({
        session_id: "cse_1",
        latest_seq: 32,
        items: [
          {
            seq: 16,
            kind: "prompt",
            text: new URL(request.url).searchParams.get("limit"),
          },
          { seq: 32, kind: "reply", text: "done" },
        ],
      }),
    ),
  );
  const { result } = renderHook(() => useConversation(id, "cse_1", true), {
    wrapper: wrapper(),
  });
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data?.map((i) => [i.kind, i.text])).toEqual([
    ["prompt", "200"],
    ["reply", "done"],
  ]);

  const off = renderHook(() => useConversation(id, "cse_2", false), {
    wrapper: wrapper(),
  });
  expect(off.result.current.fetchStatus).toBe("idle");
});
