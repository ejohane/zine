module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // MUST be last - required for react-native-reanimated
      'react-native-reanimated/plugin',
    ],
  };
};
