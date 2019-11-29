module.exports = {
	"env": {
		"browser": true,
		"es6": true,
		"node": true
	},
	"extends": [ 
		"eslint:recommended"
	],
	//"parser": "babel-eslint",
	"parserOptions": {
		"sourceType": "module",
		"ecmaVersion": 9,
		"ecmaFeatures": {
			"jsx": true,
			"experimentalObjectRestSpread": true
		}
	},
	"plugins": [],
	"rules": {
		// "indent": [ "error", "tab" ],
		"no-unused-vars": [ "warn", { "ignoreRestSiblings": true }],
		"no-console": [ 0 ],
		"quotes": [ "error", "single" ],
		"semi": [ "warn", "never" ]
	}
};