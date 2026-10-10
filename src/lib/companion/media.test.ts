import { describe, expect, it } from 'vitest';
import { sameMedia, type MediaState } from './media';

const track: MediaState = { title: 'Song', artist: 'Band', app: 'Spotify.exe', playing: true, art: 'data:image/jpeg;base64,AA' };

describe('sameMedia', () => {
  it('sees a new read of the same music as the same', () => {
    expect(sameMedia(track, { ...track })).toBe(true);
    expect(sameMedia(null, null)).toBe(true);
    expect(sameMedia({ ...track, art: undefined }, { ...track, art: null })).toBe(true);
  });

  it('sees a change of track, of play state or of cover', () => {
    expect(sameMedia(track, { ...track, title: 'Other' })).toBe(false);
    expect(sameMedia(track, { ...track, playing: false })).toBe(false);
    expect(sameMedia(track, { ...track, art: null })).toBe(false);
    expect(sameMedia(track, null)).toBe(false);
    expect(sameMedia(null, track)).toBe(false);
  });
});
