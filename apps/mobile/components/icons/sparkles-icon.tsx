import Svg, { Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export function SparklesIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 3L14 8L19 9L15 13L16 18L12 15L8 18L9 13L5 9L10 8L12 3Z" />
    </Svg>
  );
}
