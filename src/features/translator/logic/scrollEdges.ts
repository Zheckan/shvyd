export type ScrollBox = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** Edges of a scroll box that currently hide text. */
export type ScrollEdges = { above: boolean; below: boolean }

// Zoomed pages report fractional scroll positions that stop short of the end.
const SLACK_PX = 1

export function scrollEdges(box: ScrollBox): ScrollEdges {
  return {
    above: box.scrollTop > SLACK_PX,
    below: box.scrollHeight - box.clientHeight - box.scrollTop > SLACK_PX,
  }
}
