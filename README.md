# Factual Chrome extension

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

## Updating code

* ```git pull origin branch_name```
* ```npm install```

## Creating a build

* ```gulp build``` will generate a build in ```./dist```.

## Replicating project for your fact-checker

If you would like to create a similar plugin for your factchecker these are the steps you have to follow:
 
1. Update `src/manifest.json` with description of your factchecker
    - aa
1. Override `src/assets/icon*` with your own icons 
    - `icon_gray` is shown in task bar when there are no factchecked statements on the current website
   

