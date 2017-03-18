# Chrome extension showing fact-checked statements

## Deployment for Polish Demagog (a prototype)
![demagog-multiple](https://cloud.githubusercontent.com/assets/849975/23593645/0b7c215a-0212-11e7-8b8b-6b3adc31e3d9.JPG)

## Releases
For the latest packaged version check the [releases](https://github.com/TransparenCEE/factchecker-plugin-chrome/releases) page. Drop the `crx` file in the Chrome extensions page (`chrome://extensions/`).

## Installation

* Install NodeJS from https://nodejs.org/
* ```npm install -g gulp webpack```
* ```npm install```

## Running

* ```gulp```
* In the Chrome extensions page, ```Load unpacked extension...``` and select the ```build``` directory.

The extension will automatically reload on code changes.

For the extension to work you will need to have a running compatible API: https://github.com/TransparenCEE/factchecked-api-wpplugin

## Updating code

* ```git pull origin branch_name```
* ```npm install```

## Creating a build

* ```gulp build``` will generate a build in ```./dist```.

## Replicating project for your fact-checker

If you would like to create a similar plugin for your factchecker these are the steps you have to follow:
 
1. Update `src/manifest.json` and `package.json` with description of your factchecker
1. Define `src/js/config.js` configuration using `src/js/config.js.template`
1. Override `src/assets/icon*` with your own icons 
    - `icon_gray` is shown in task bar when there are no factchecked statements on the current website
1. Modify `src/views/*` templates according to your needs
1. Style your ratings in `src/css/factual.css`
    - Define colors and images for different factchecker-fact-mark-${fact.rating}
    
   

