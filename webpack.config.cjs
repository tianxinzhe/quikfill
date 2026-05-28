const path = require('path');

module.exports = {
  entry: {
    background: './src/background.ts',
    sidepanel: './src/sidepanel.ts',
    content: './src/content.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  mode: 'production'
};