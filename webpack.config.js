const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: '',
    },
    mode: 'development',
    devtool: 'inline-source-map',
    devServer: {
        static: './dist',
        hot: true,
        port: 8080,
        open: true,
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(fbx|png|jpe?g|gif|svg)$/i, // Добавлено jpe?g для поддержки .jpg и .jpeg
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            esModule: false, // Совместимость с Three.js
                            outputPath: 'assets', // Размещаем изображения в папке 'assets' внутри 'dist'
                        },
                    },
                ],
            },
            // Правило для аудиофайлов
            {
                test: /\.(mp3|wav|ogg)$/i,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            esModule: false, // Совместимость с Three.js
                            outputPath: 'sounds', // Размещаем звуки в папке 'sounds' внутри 'dist'
                        },
                    },
                ],
            },
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './src/index.html',
        }),
    ],
};
