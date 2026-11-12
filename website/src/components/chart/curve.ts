// Monotone cubic curve through the points (Steffen 1990), so it never overshoots between them.
export const curve = (points: [number, number][]) => {
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0]));
  const tangents = points.map(([x], i) => {
    if (i === 0 || i === points.length - 1) {
      return slopes[Math.min(i, slopes.length - 1)] ?? 0;
    }

    const [before, after] = [slopes[i - 1], slopes[i]];
    const [left, right] = [x - points[i - 1][0], points[i + 1][0] - x];
    const average = (before * right + after * left) / (left + right);
    return (Math.sign(before) + Math.sign(after)) * Math.min(Math.abs(before), Math.abs(after), Math.abs(average) / 2) || 0;
  });

  return points
    .map(([x, y], i) => {
      if (i === 0) {
        return `M${x},${y}`;
      }

      const [x0, y0] = points[i - 1];
      const third = (x - x0) / 3;
      return `C${x0 + third},${y0 + third * tangents[i - 1]} ${x - third},${y - third * tangents[i]} ${x},${y}`;
    })
    .join('');
};