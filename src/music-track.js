export function createMusicTrack(src, loop = false) {
  const track = new Audio();
  track.preload = "none";
  track.loop = loop;
  track.src = src;
  return track;
}
