export interface EdgeBackGesture { x0: number; dx: number; dy: number; vx: number; numberActiveTouches: number }

export function shouldStartEdgeBack(gesture: EdgeBackGesture, canGoBack: boolean, platform: string): boolean {
  return platform === 'ios' && canGoBack && gesture.numberActiveTouches === 1
    && gesture.x0 >= 0 && gesture.x0 <= 28 && gesture.dx > 12
    && gesture.dx > Math.abs(gesture.dy) * 1.6;
}
export function shouldFinishEdgeBack(gesture: Pick<EdgeBackGesture, 'dx' | 'dy' | 'vx'>): boolean {
  return gesture.dx > Math.abs(gesture.dy) * 1.6
    && (gesture.dx >= 76 || gesture.dx >= 28 && gesture.vx >= 0.55);
}
