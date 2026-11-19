import { clock, containerFor, placements } from './media';

describe('video media helpers', () => {
  it('picks a container that keeps the original sound', () => {
    expect(containerFor('aac')).toEqual({ container: 'mp4', extension: 'm4a' });
    expect(containerFor('opus')).toEqual({ container: 'ogg', extension: 'ogg' });
    expect(containerFor('mp3')).toEqual({ container: 'mp3', extension: 'mp3' });
    expect(containerFor('pcm-s16')).toEqual({ container: 'wav', extension: 'wav' });
    expect(containerFor('ac3')).toBeNull();
    expect(containerFor(null)).toBeNull();
  });

  it('places a sound once or repeats it to fill the video', () => {
    expect(placements(2, 5, 30, false)).toEqual([2]);
    expect(placements(0, 10, 30, true)).toEqual([0, 10, 20]);
    expect(placements(5, 10, 30, true)).toEqual([5, 15, 25]);
    expect(placements(40, 10, 30, true)).toEqual([]);
  });

  it('formats times', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});
