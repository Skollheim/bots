/*
 * What every animated companion shares, whatever its family: the face
 * `CompanionCharacter` works out from the mood and its flags, the props it
 * hands a family's character (`JellyCharacter`, `BubbleCharacter`,
 * `CapsuleCharacter`, `RetroCharacter`), the state its `RobotFace` drawing
 * takes, and which character draws a skin. The box is `CompanionCharacter`'s
 * own drawing.
 */
import type { Robot, RobotFamily } from '../robots';

/** What the companion shows it feels now. */
export type Face = 'awake' | 'sleep' | 'yawn' | 'groove' | 'typing' | 'working' | 'calling' | 'happy' | 'worried' | 'alarm' | 'calm' | 'rest' | 'cheer' | 'game' | 'startled';
/** An idle gesture now and then. */
export type Act = 'look' | 'blink' | 'peek' | 'stretch' | 'yawn';
/** The light's colour: the mood's, or a calm one. */
export type Tone = 'idle' | 'working' | 'calling' | 'happy' | 'worried';
/** How `RobotFace` moves on its own: a blink, a glance, a hop, or nothing. */
export type FaceState = 'idle' | 'working' | 'waiting' | 'still';

/** What `CompanionCharacter` hands the character of a family other than the box. */
export interface CharacterProps {
  robot: Robot;
  face: Face;
  tone: Tone;
  /** Where the eyes look, each axis from -1 to 1. */
  look: { x: number; y: number };
  /** Poked: a hop. */
  bouncing: boolean;
  /** Poked too often: a wobble, eyes spinning. */
  dizzy: boolean;
  act: Act | null;
  size: number;
  label: string;
}

/** The faces with the eyes shut or nearly: the drawing keeps still, so the character can close them. */
const SHUT: ReadonlySet<Face> = new Set(['sleep', 'calm', 'rest', 'startled', 'yawn']);

/** The state `RobotFace` takes for a face: it blinks at rest, glances while working, hops while it calls. */
export function faceState(face: Face): FaceState {
  if (SHUT.has(face)) return 'still';
  if (face === 'working') return 'working';
  return face === 'calling' || face === 'alarm' ? 'waiting' : 'idle';
}

/** The character that draws a skin: its family's, or the classic box when there is none. */
export function characterOf(skin: Robot | null | undefined): RobotFamily {
  return skin?.family ?? 'box';
}

/** The mark beside the character: a z asleep, a ! when it calls, sparks for joy. */
export function markOf(face: Face): 'z' | 'shout' | 'spark' | null {
  if (face === 'sleep') return 'z';
  if (face === 'calling' || face === 'alarm') return 'shout';
  return face === 'happy' || face === 'cheer' ? 'spark' : null;
}
