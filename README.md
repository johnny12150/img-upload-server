# Jquery Upload Image Server

## Requirements:
Using `ascdc/node` as docker image
> * cisd的 image server 需獨立為另外一個container
> * 會和cisd共用media資料夾

Need to install imagemagick for ubuntu to create thumbnail:
```bash
apt-get update
apt-get install imagemagick
```

Also need some extra npm packages:
`npm i node-fetch `
