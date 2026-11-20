/** ⌘↵ on an empty message box takes the prompt the agent suggests (Claude Code's faint one). Live's ⌘↵
 *  comes first (wherever the focus is), so the box in front says here whether it can: Live asks it when
 *  it is idle (nothing heard, nothing on its way), and arms or sends otherwise. */
let taker: (() => boolean) | null = null

export function setSuggestionTaker(take: (() => boolean) | null) {
  taker = take
}

/** Takes the suggestion if the box in front is empty and one shows. True when it did. */
export function takeSuggestion(): boolean {
  return taker?.() ?? false
}
