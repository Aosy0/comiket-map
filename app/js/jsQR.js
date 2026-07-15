/**
 * jsQR - Javascript QR Code Reader
 * https://github.com/cozmo/jsQR
 * Version 1.4.0
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if (typeof exports === 'object' && typeof module === 'object') module.exports = factory();
	else if (typeof define === 'function' && define.amd) define([], factory);
	else if (typeof exports === 'object') exports.jsQR = factory();
	else root.jsQR = factory();
})(typeof self !== 'undefined' ? self : this, () =>
	((modules) => {
		// webpackBootstrap
		/******/ // The module cache
		/******/ var installedModules = {};
		/******/
		/******/ // The require function
		/******/ function __webpack_require__(moduleId) {
			/******/
			/******/ // Check if module is in cache
			/******/ if (installedModules[moduleId]) {
				/******/ return installedModules[moduleId].exports;
				/******/
			}
			/******/ // Create a new module (and put it into the cache)
			/******/ var module = (installedModules[moduleId] = {
				/******/ i: moduleId,
				/******/ l: false,
				/******/ exports: {},
				/******/
			});
			/******/
			/******/ // Execute the module function
			/******/ modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
			/******/
			/******/ // Flag the module as loaded
			/******/ module.l = true;
			/******/
			/******/ // Return the exports of the module
			/******/ return module.exports;
			/******/
		}
		/******/
		/******/
		/******/ // expose the modules object (__webpack_modules__)
		/******/ __webpack_require__.m = modules;
		/******/
		/******/ // expose the module cache
		/******/ __webpack_require__.c = installedModules;
		/******/
		/******/ // define getter function for harmony exports
		/******/ __webpack_require__.d = (exports, name, getter) => {
			/******/ if (!__webpack_require__.o(exports, name)) {
				/******/ Object.defineProperty(exports, name, {
					/******/ configurable: false,
					/******/ enumerable: true,
					/******/ get: getter,
					/******/
				});
				/******/
			}
			/******/
		};
		/******/
		/******/ // getDefaultExport function for compatibility with non-harmony modules
		/******/ __webpack_require__.n = (module) => {
			/******/ var getter = module?.__esModule
				? /******/ function getDefault() {
						return module.default;
					}
				: /******/ function getModuleExports() {
						return module;
					};
			/******/ __webpack_require__.d(getter, 'a', getter);
			/******/ return getter;
			/******/
		};
		/******/
		/******/ // Object.prototype.hasOwnProperty.call
		/******/ __webpack_require__.o = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
		/******/
		/******/ // __webpack_public_path__
		/******/ __webpack_require__.p = '';
		/******/
		/******/ // Load entry module and return exports
		/******/ return __webpack_require__((__webpack_require__.s = 3));
		/******/
	})(
		/************************************************************************/
		/******/ [
			/* 0 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var BitMatrix = /** @class */ (() => {
					function BitMatrix(data, width) {
						this.width = width;
						this.height = data.length / width;
						this.data = data;
					}
					BitMatrix.createEmpty = (width, height) => new BitMatrix(new Uint8ClampedArray(width * height), width);
					BitMatrix.prototype.get = function (x, y) {
						if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
							return false;
						}
						return !!this.data[y * this.width + x];
					};
					BitMatrix.prototype.set = function (x, y, v) {
						this.data[y * this.width + x] = v ? 1 : 0;
					};
					BitMatrix.prototype.setRegion = function (left, top, width, height, v) {
						for (var y = top; y < top + height; y++) {
							for (var x = left; x < left + width; x++) {
								this.set(x, y, !!v);
							}
						}
					};
					return BitMatrix;
				})();
				exports.BitMatrix = BitMatrix;

				/***/
			},
			/* 1 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var GenericGFPoly_1 = __webpack_require__(2);
				function addOrSubtractGF(a, b) {
					return a ^ b;
				}
				exports.addOrSubtractGF = addOrSubtractGF;
				var GenericGF = /** @class */ (() => {
					function GenericGF(primitive, size, genBase) {
						this.primitive = primitive;
						this.size = size;
						this.generatorBase = genBase;
						this.expTable = new Array(this.size);
						this.logTable = new Array(this.size);
						var x = 1;
						for (var i = 0; i < this.size; i++) {
							this.expTable[i] = x;
							x = x * 2;
							if (x >= this.size) {
								x = (x ^ this.primitive) & (this.size - 1);
							}
						}
						for (var i = 0; i < this.size - 1; i++) {
							this.logTable[this.expTable[i]] = i;
						}
						this.zero = new GenericGFPoly_1.default(this, Uint8ClampedArray.from([0]));
						this.one = new GenericGFPoly_1.default(this, Uint8ClampedArray.from([1]));
					}
					GenericGF.prototype.multiply = function (a, b) {
						if (a === 0 || b === 0) {
							return 0;
						}
						return this.expTable[(this.logTable[a] + this.logTable[b]) % (this.size - 1)];
					};
					GenericGF.prototype.inverse = function (a) {
						if (a === 0) {
							throw new Error("Can't invert 0");
						}
						return this.expTable[this.size - this.logTable[a] - 1];
					};
					GenericGF.prototype.buildMonomial = function (degree, coefficient) {
						if (degree < 0) {
							throw new Error('Invalid monomial degree less than 0');
						}
						if (coefficient === 0) {
							return this.zero;
						}
						var coefficients = new Uint8ClampedArray(degree + 1);
						coefficients[0] = coefficient;
						return new GenericGFPoly_1.default(this, coefficients);
					};
					GenericGF.prototype.log = function (a) {
						if (a === 0) {
							throw new Error("Can't take log(0)");
						}
						return this.logTable[a];
					};
					GenericGF.prototype.exp = function (a) {
						return this.expTable[a];
					};
					return GenericGF;
				})();
				exports.default = GenericGF;

				/***/
			},
			/* 2 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var GenericGF_1 = __webpack_require__(1);
				var GenericGFPoly = /** @class */ (() => {
					function GenericGFPoly(field, coefficients) {
						if (coefficients.length === 0) {
							throw new Error('No coefficients.');
						}
						this.field = field;
						var coefficientsLength = coefficients.length;
						if (coefficientsLength > 1 && coefficients[0] === 0) {
							var firstNonZero = 1;
							while (firstNonZero < coefficientsLength && coefficients[firstNonZero] === 0) {
								firstNonZero++;
							}
							if (firstNonZero === coefficientsLength) {
								this.coefficients = field.zero.coefficients;
							} else {
								this.coefficients = new Uint8ClampedArray(coefficientsLength - firstNonZero);
								for (var i = 0; i < this.coefficients.length; i++) {
									this.coefficients[i] = coefficients[firstNonZero + i];
								}
							}
						} else {
							this.coefficients = coefficients;
						}
					}
					GenericGFPoly.prototype.degree = function () {
						return this.coefficients.length - 1;
					};
					GenericGFPoly.prototype.isZero = function () {
						return this.coefficients[0] === 0;
					};
					GenericGFPoly.prototype.getCoefficient = function (degree) {
						return this.coefficients[this.coefficients.length - 1 - degree];
					};
					GenericGFPoly.prototype.addOrSubtract = function (other) {
						var _a;
						if (this.isZero()) {
							return other;
						}
						if (other.isZero()) {
							return this;
						}
						var smallerCoefficients = this.coefficients;
						var largerCoefficients = other.coefficients;
						if (smallerCoefficients.length > largerCoefficients.length) {
							(_a = [largerCoefficients, smallerCoefficients]),
								(smallerCoefficients = _a[0]),
								(largerCoefficients = _a[1]);
						}
						var sumDiff = new Uint8ClampedArray(largerCoefficients.length);
						var lengthDiff = largerCoefficients.length - smallerCoefficients.length;
						for (var i = 0; i < lengthDiff; i++) {
							sumDiff[i] = largerCoefficients[i];
						}
						for (var i = lengthDiff; i < largerCoefficients.length; i++) {
							sumDiff[i] = GenericGF_1.addOrSubtractGF(smallerCoefficients[i - lengthDiff], largerCoefficients[i]);
						}
						return new GenericGFPoly(this.field, sumDiff);
					};
					GenericGFPoly.prototype.multiply = function (scalar) {
						if (scalar === 0) {
							return this.field.zero;
						}
						if (scalar === 1) {
							return this;
						}
						var size = this.coefficients.length;
						var product = new Uint8ClampedArray(size);
						for (var i = 0; i < size; i++) {
							product[i] = this.field.multiply(this.coefficients[i], scalar);
						}
						return new GenericGFPoly(this.field, product);
					};
					GenericGFPoly.prototype.multiplyPoly = function (other) {
						if (this.isZero() || other.isZero()) {
							return this.field.zero;
						}
						var aCoefficients = this.coefficients;
						var aLength = aCoefficients.length;
						var bCoefficients = other.coefficients;
						var bLength = bCoefficients.length;
						var product = new Uint8ClampedArray(aLength + bLength - 1);
						for (var i = 0; i < aLength; i++) {
							var aCoeff = aCoefficients[i];
							for (var j = 0; j < bLength; j++) {
								product[i + j] = GenericGF_1.addOrSubtractGF(
									product[i + j],
									this.field.multiply(aCoeff, bCoefficients[j]),
								);
							}
						}
						return new GenericGFPoly(this.field, product);
					};
					GenericGFPoly.prototype.multiplyByMonomial = function (degree, coefficient) {
						if (degree < 0) {
							throw new Error('Invalid degree less than 0');
						}
						if (coefficient === 0) {
							return this.field.zero;
						}
						var size = this.coefficients.length;
						var product = new Uint8ClampedArray(size + degree);
						for (var i = 0; i < size; i++) {
							product[i] = this.field.multiply(this.coefficients[i], coefficient);
						}
						return new GenericGFPoly(this.field, product);
					};
					GenericGFPoly.prototype.evaluateAt = function (a) {
						var result = 0;
						if (a === 0) {
							return this.getCoefficient(0);
						}
						var size = this.coefficients.length;
						if (a === 1) {
							this.coefficients.forEach((coefficient) => {
								result = GenericGF_1.addOrSubtractGF(result, coefficient);
							});
							return result;
						}
						result = this.coefficients[0];
						for (var i = 1; i < size; i++) {
							result = GenericGF_1.addOrSubtractGF(this.field.multiply(a, result), this.coefficients[i]);
						}
						return result;
					};
					return GenericGFPoly;
				})();
				exports.default = GenericGFPoly;

				/***/
			},
			/* 3 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var binarizer_1 = __webpack_require__(4);
				var decoder_1 = __webpack_require__(5);
				var extractor_1 = __webpack_require__(11);
				var locator_1 = __webpack_require__(12);
				function scan(matrix) {
					var locations = locator_1.locate(matrix);
					if (!locations) {
						return null;
					}
					for (var _i = 0, locations_1 = locations; _i < locations_1.length; _i++) {
						var location_1 = locations_1[_i];
						var extracted = extractor_1.extract(matrix, location_1);
						var decoded = decoder_1.decode(extracted.matrix);
						if (decoded) {
							return {
								binaryData: decoded.bytes,
								data: decoded.text,
								chunks: decoded.chunks,
								version: decoded.version,
								location: {
									topRightCorner: extracted.mappingFunction(location_1.dimension, 0),
									topLeftCorner: extracted.mappingFunction(0, 0),
									bottomRightCorner: extracted.mappingFunction(location_1.dimension, location_1.dimension),
									bottomLeftCorner: extracted.mappingFunction(0, location_1.dimension),
									topRightFinderPattern: location_1.topRight,
									topLeftFinderPattern: location_1.topLeft,
									bottomLeftFinderPattern: location_1.bottomLeft,
									bottomRightAlignmentPattern: location_1.alignmentPattern,
								},
							};
						}
					}
					return null;
				}
				var defaultOptions = {
					inversionAttempts: 'attemptBoth',
				};
				function jsQR(data, width, height, providedOptions) {
					if (providedOptions === void 0) {
						providedOptions = {};
					}
					var options = defaultOptions;
					Object.keys(options || {}).forEach((opt) => {
						options[opt] = providedOptions[opt] || options[opt];
					});
					var shouldInvert = options.inversionAttempts === 'attemptBoth' || options.inversionAttempts === 'invertFirst';
					var tryInvertedFirst =
						options.inversionAttempts === 'onlyInvert' || options.inversionAttempts === 'invertFirst';
					var _a = binarizer_1.binarize(data, width, height, shouldInvert);
					var binarized = _a.binarized;
					var inverted = _a.inverted;
					var result = scan(tryInvertedFirst ? inverted : binarized);
					if (!result && (options.inversionAttempts === 'attemptBoth' || options.inversionAttempts === 'invertFirst')) {
						result = scan(tryInvertedFirst ? binarized : inverted);
					}
					return result;
				}
				jsQR.default = jsQR;
				exports.default = jsQR;

				/***/
			},
			/* 4 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var BitMatrix_1 = __webpack_require__(0);
				var REGION_SIZE = 8;
				var MIN_DYNAMIC_RANGE = 24;
				function numBetween(value, min, max) {
					return value < min ? min : value > max ? max : value;
				}
				var Matrix = /** @class */ (() => {
					function Matrix(width, height) {
						this.width = width;
						this.data = new Uint8ClampedArray(width * height);
					}
					Matrix.prototype.get = function (x, y) {
						return this.data[y * this.width + x];
					};
					Matrix.prototype.set = function (x, y, value) {
						this.data[y * this.width + x] = value;
					};
					return Matrix;
				})();
				function binarize(data, width, height, returnInverted) {
					if (data.length !== width * height * 4) {
						throw new Error('Malformed data passed to binarizer.');
					}
					var greyscalePixels = new Matrix(width, height);
					for (var x = 0; x < width; x++) {
						for (var y = 0; y < height; y++) {
							var r = data[(y * width + x) * 4 + 0];
							var g = data[(y * width + x) * 4 + 1];
							var b = data[(y * width + x) * 4 + 2];
							greyscalePixels.set(x, y, 0.2126 * r + 0.7152 * g + 0.0722 * b);
						}
					}
					var horizontalRegionCount = Math.ceil(width / REGION_SIZE);
					var verticalRegionCount = Math.ceil(height / REGION_SIZE);
					var blackPoints = new Matrix(horizontalRegionCount, verticalRegionCount);
					for (var verticalRegion = 0; verticalRegion < verticalRegionCount; verticalRegion++) {
						for (var hortizontalRegion = 0; hortizontalRegion < horizontalRegionCount; hortizontalRegion++) {
							var sum = 0;
							var min = Number.POSITIVE_INFINITY;
							var max = 0;
							for (var y = 0; y < REGION_SIZE; y++) {
								for (var x = 0; x < REGION_SIZE; x++) {
									var pixelLumosity = greyscalePixels.get(
										hortizontalRegion * REGION_SIZE + x,
										verticalRegion * REGION_SIZE + y,
									);
									sum += pixelLumosity;
									min = Math.min(min, pixelLumosity);
									max = Math.max(max, pixelLumosity);
								}
							}
							var average = sum / REGION_SIZE ** 2;
							if (max - min <= MIN_DYNAMIC_RANGE) {
								average = min / 2;
								if (verticalRegion > 0 && hortizontalRegion > 0) {
									var averageNeighborBlackPoint =
										(blackPoints.get(hortizontalRegion, verticalRegion - 1) +
											2 * blackPoints.get(hortizontalRegion - 1, verticalRegion) +
											blackPoints.get(hortizontalRegion - 1, verticalRegion - 1)) /
										4;
									if (min < averageNeighborBlackPoint) {
										average = averageNeighborBlackPoint;
									}
								}
							}
							blackPoints.set(hortizontalRegion, verticalRegion, average);
						}
					}
					var binarized = BitMatrix_1.BitMatrix.createEmpty(width, height);
					var inverted = null;
					if (returnInverted) {
						inverted = BitMatrix_1.BitMatrix.createEmpty(width, height);
					}
					for (var verticalRegion = 0; verticalRegion < verticalRegionCount; verticalRegion++) {
						for (var hortizontalRegion = 0; hortizontalRegion < horizontalRegionCount; hortizontalRegion++) {
							var left = numBetween(hortizontalRegion, 2, horizontalRegionCount - 3);
							var top_1 = numBetween(verticalRegion, 2, verticalRegionCount - 3);
							var sum = 0;
							for (var xRegion = -2; xRegion <= 2; xRegion++) {
								for (var yRegion = -2; yRegion <= 2; yRegion++) {
									sum += blackPoints.get(left + xRegion, top_1 + yRegion);
								}
							}
							var threshold = sum / 25;
							for (var xRegion = 0; xRegion < REGION_SIZE; xRegion++) {
								for (var yRegion = 0; yRegion < REGION_SIZE; yRegion++) {
									var x = hortizontalRegion * REGION_SIZE + xRegion;
									var y = verticalRegion * REGION_SIZE + yRegion;
									var lum = greyscalePixels.get(x, y);
									binarized.set(x, y, lum <= threshold);
									if (returnInverted) {
										inverted.set(x, y, !(lum <= threshold));
									}
								}
							}
						}
					}
					if (returnInverted) {
						return { binarized: binarized, inverted: inverted };
					}
					return { binarized: binarized };
				}
				exports.binarize = binarize;

				/***/
			},
			/* 5 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var BitMatrix_1 = __webpack_require__(0);
				var decodeData_1 = __webpack_require__(6);
				var reedsolomon_1 = __webpack_require__(9);
				var version_1 = __webpack_require__(10);
				function numBitsDiffering(x, y) {
					var z = x ^ y;
					var bitCount = 0;
					while (z) {
						bitCount++;
						z &= z - 1;
					}
					return bitCount;
				}
				function pushBit(bit, byte) {
					return (byte << 1) | bit;
				}
				var FORMAT_INFO_TABLE = [
					{ bits: 0x5412, formatInfo: { errorCorrectionLevel: 1, dataMask: 0 } },
					{ bits: 0x5125, formatInfo: { errorCorrectionLevel: 1, dataMask: 1 } },
					{ bits: 0x5e7c, formatInfo: { errorCorrectionLevel: 1, dataMask: 2 } },
					{ bits: 0x5b4b, formatInfo: { errorCorrectionLevel: 1, dataMask: 3 } },
					{ bits: 0x45f9, formatInfo: { errorCorrectionLevel: 1, dataMask: 4 } },
					{ bits: 0x40ce, formatInfo: { errorCorrectionLevel: 1, dataMask: 5 } },
					{ bits: 0x4f97, formatInfo: { errorCorrectionLevel: 1, dataMask: 6 } },
					{ bits: 0x4aa0, formatInfo: { errorCorrectionLevel: 1, dataMask: 7 } },
					{ bits: 0x77c4, formatInfo: { errorCorrectionLevel: 0, dataMask: 0 } },
					{ bits: 0x72f3, formatInfo: { errorCorrectionLevel: 0, dataMask: 1 } },
					{ bits: 0x7daa, formatInfo: { errorCorrectionLevel: 0, dataMask: 2 } },
					{ bits: 0x789d, formatInfo: { errorCorrectionLevel: 0, dataMask: 3 } },
					{ bits: 0x662f, formatInfo: { errorCorrectionLevel: 0, dataMask: 4 } },
					{ bits: 0x6318, formatInfo: { errorCorrectionLevel: 0, dataMask: 5 } },
					{ bits: 0x6c41, formatInfo: { errorCorrectionLevel: 0, dataMask: 6 } },
					{ bits: 0x6976, formatInfo: { errorCorrectionLevel: 0, dataMask: 7 } },
					{ bits: 0x1689, formatInfo: { errorCorrectionLevel: 3, dataMask: 0 } },
					{ bits: 0x13be, formatInfo: { errorCorrectionLevel: 3, dataMask: 1 } },
					{ bits: 0x1ce7, formatInfo: { errorCorrectionLevel: 3, dataMask: 2 } },
					{ bits: 0x19d0, formatInfo: { errorCorrectionLevel: 3, dataMask: 3 } },
					{ bits: 0x0762, formatInfo: { errorCorrectionLevel: 3, dataMask: 4 } },
					{ bits: 0x0255, formatInfo: { errorCorrectionLevel: 3, dataMask: 5 } },
					{ bits: 0x0d0c, formatInfo: { errorCorrectionLevel: 3, dataMask: 6 } },
					{ bits: 0x083b, formatInfo: { errorCorrectionLevel: 3, dataMask: 7 } },
					{ bits: 0x355f, formatInfo: { errorCorrectionLevel: 2, dataMask: 0 } },
					{ bits: 0x3068, formatInfo: { errorCorrectionLevel: 2, dataMask: 1 } },
					{ bits: 0x3f31, formatInfo: { errorCorrectionLevel: 2, dataMask: 2 } },
					{ bits: 0x3a06, formatInfo: { errorCorrectionLevel: 2, dataMask: 3 } },
					{ bits: 0x24b4, formatInfo: { errorCorrectionLevel: 2, dataMask: 4 } },
					{ bits: 0x2183, formatInfo: { errorCorrectionLevel: 2, dataMask: 5 } },
					{ bits: 0x2eda, formatInfo: { errorCorrectionLevel: 2, dataMask: 6 } },
					{ bits: 0x2bed, formatInfo: { errorCorrectionLevel: 2, dataMask: 7 } },
				];
				var DATA_MASKS = [
					(p) => (p.y + p.x) % 2 === 0,
					(p) => p.y % 2 === 0,
					(p) => p.x % 3 === 0,
					(p) => (p.y + p.x) % 3 === 0,
					(p) => (Math.floor(p.y / 2) + Math.floor(p.x / 3)) % 2 === 0,
					(p) => ((p.x * p.y) % 2) + ((p.x * p.y) % 3) === 0,
					(p) => (((p.y * p.x) % 2) + ((p.y * p.x) % 3)) % 2 === 0,
					(p) => (((p.y + p.x) % 2) + ((p.y * p.x) % 3)) % 2 === 0,
				];
				function buildFunctionPatternMask(version) {
					var dimension = 17 + 4 * version.versionNumber;
					var matrix = BitMatrix_1.BitMatrix.createEmpty(dimension, dimension);
					matrix.setRegion(0, 0, 9, 9, true);
					matrix.setRegion(dimension - 8, 0, 8, 9, true);
					matrix.setRegion(0, dimension - 8, 9, 8, true);
					for (var _i = 0, _a = version.alignmentPatternCenters; _i < _a.length; _i++) {
						var x = _a[_i];
						for (var _b = 0, _c = version.alignmentPatternCenters; _b < _c.length; _b++) {
							var y = _c[_b];
							if (!((x === 6 && y === 6) || (x === 6 && y === dimension - 7) || (x === dimension - 7 && y === 6))) {
								matrix.setRegion(x - 2, y - 2, 5, 5, true);
							}
						}
					}
					matrix.setRegion(6, 9, 1, dimension - 17, true);
					matrix.setRegion(9, 6, dimension - 17, 1, true);
					if (version.versionNumber > 6) {
						matrix.setRegion(dimension - 11, 0, 3, 6, true);
						matrix.setRegion(0, dimension - 11, 6, 3, true);
					}
					return matrix;
				}
				function readCodewords(matrix, version, formatInfo) {
					var dataMask = DATA_MASKS[formatInfo.dataMask];
					var dimension = matrix.height;
					var functionPatternMask = buildFunctionPatternMask(version);
					var codewords = [];
					var currentByte = 0;
					var bitsRead = 0;
					var readingUp = true;
					for (var columnIndex = dimension - 1; columnIndex > 0; columnIndex -= 2) {
						if (columnIndex === 6) {
							columnIndex--;
						}
						for (var i = 0; i < dimension; i++) {
							var y = readingUp ? dimension - 1 - i : i;
							for (var columnOffset = 0; columnOffset < 2; columnOffset++) {
								var x = columnIndex - columnOffset;
								if (!functionPatternMask.get(x, y)) {
									bitsRead++;
									var bit = matrix.get(x, y);
									if (dataMask({ y: y, x: x })) {
										bit = !bit;
									}
									currentByte = pushBit(bit, currentByte);
									if (bitsRead === 8) {
										codewords.push(currentByte);
										bitsRead = 0;
										currentByte = 0;
									}
								}
							}
						}
						readingUp = !readingUp;
					}
					return codewords;
				}
				function readVersion(matrix) {
					var dimension = matrix.height;
					var provisionalVersion = Math.floor((dimension - 17) / 4);
					if (provisionalVersion <= 6) {
						return version_1.VERSIONS[provisionalVersion - 1];
					}
					var topRightVersionBits = 0;
					for (var y = 5; y >= 0; y--) {
						for (var x = dimension - 9; x >= dimension - 11; x--) {
							topRightVersionBits = pushBit(matrix.get(x, y), topRightVersionBits);
						}
					}
					var bottomLeftVersionBits = 0;
					for (var x = 5; x >= 0; x--) {
						for (var y = dimension - 9; y >= dimension - 11; y--) {
							bottomLeftVersionBits = pushBit(matrix.get(x, y), bottomLeftVersionBits);
						}
					}
					var bestDifference = Number.POSITIVE_INFINITY;
					var bestVersion;
					for (var _i = 0, VERSIONS_1 = version_1.VERSIONS; _i < VERSIONS_1.length; _i++) {
						var version = VERSIONS_1[_i];
						if (version.infoBits === topRightVersionBits || version.infoBits === bottomLeftVersionBits) {
							return version;
						}
						var difference = numBitsDiffering(topRightVersionBits, version.infoBits);
						if (difference < bestDifference) {
							bestVersion = version;
							bestDifference = difference;
						}
						difference = numBitsDiffering(bottomLeftVersionBits, version.infoBits);
						if (difference < bestDifference) {
							bestVersion = version;
							bestDifference = difference;
						}
					}
					if (bestDifference <= 3) {
						return bestVersion;
					}
				}
				function readFormatInformation(matrix) {
					var topLeftFormatInfoBits = 0;
					for (var x = 0; x <= 8; x++) {
						if (x !== 6) {
							topLeftFormatInfoBits = pushBit(matrix.get(x, 8), topLeftFormatInfoBits);
						}
					}
					for (var y = 7; y >= 0; y--) {
						if (y !== 6) {
							topLeftFormatInfoBits = pushBit(matrix.get(8, y), topLeftFormatInfoBits);
						}
					}
					var dimension = matrix.height;
					var topRightBottomRightFormatInfoBits = 0;
					for (var y = dimension - 1; y >= dimension - 7; y--) {
						topRightBottomRightFormatInfoBits = pushBit(matrix.get(8, y), topRightBottomRightFormatInfoBits);
					}
					for (var x = dimension - 8; x < dimension; x++) {
						topRightBottomRightFormatInfoBits = pushBit(matrix.get(x, 8), topRightBottomRightFormatInfoBits);
					}
					var bestDifference = Number.POSITIVE_INFINITY;
					var bestFormatInfo = null;
					for (var _i = 0, FORMAT_INFO_TABLE_1 = FORMAT_INFO_TABLE; _i < FORMAT_INFO_TABLE_1.length; _i++) {
						var _a = FORMAT_INFO_TABLE_1[_i];
						var bits = _a.bits;
						var formatInfo = _a.formatInfo;
						if (bits === topLeftFormatInfoBits || bits === topRightBottomRightFormatInfoBits) {
							return formatInfo;
						}
						var difference = numBitsDiffering(topLeftFormatInfoBits, bits);
						if (difference < bestDifference) {
							bestFormatInfo = formatInfo;
							bestDifference = difference;
						}
						if (topLeftFormatInfoBits !== topRightBottomRightFormatInfoBits) {
							difference = numBitsDiffering(topRightBottomRightFormatInfoBits, bits);
							if (difference < bestDifference) {
								bestFormatInfo = formatInfo;
								bestDifference = difference;
							}
						}
					}
					if (bestDifference <= 3) {
						return bestFormatInfo;
					}
					return null;
				}
				function getDataBlocks(codewords, version, ecLevel) {
					var ecInfo = version.errorCorrectionLevels[ecLevel];
					var dataBlocks = [];
					var totalCodewords = 0;
					ecInfo.ecBlocks.forEach((block) => {
						for (var i = 0; i < block.numBlocks; i++) {
							dataBlocks.push({ numDataCodewords: block.dataCodewordsPerBlock, codewords: [] });
							totalCodewords += block.dataCodewordsPerBlock + ecInfo.ecCodewordsPerBlock;
						}
					});
					if (codewords.length < totalCodewords) {
						return null;
					}
					codewords = codewords.slice(0, totalCodewords);
					var shortBlockSize = ecInfo.ecBlocks[0].dataCodewordsPerBlock;
					for (var i = 0; i < shortBlockSize; i++) {
						for (var _i = 0, dataBlocks_1 = dataBlocks; _i < dataBlocks_1.length; _i++) {
							var dataBlock = dataBlocks_1[_i];
							dataBlock.codewords.push(codewords.shift());
						}
					}
					if (ecInfo.ecBlocks.length > 1) {
						var smallBlockCount = ecInfo.ecBlocks[0].numBlocks;
						var largeBlockCount = ecInfo.ecBlocks[1].numBlocks;
						for (var i = 0; i < largeBlockCount; i++) {
							dataBlocks[smallBlockCount + i].codewords.push(codewords.shift());
						}
					}
					while (codewords.length > 0) {
						for (var _a = 0, dataBlocks_2 = dataBlocks; _a < dataBlocks_2.length; _a++) {
							var dataBlock = dataBlocks_2[_a];
							dataBlock.codewords.push(codewords.shift());
						}
					}
					return dataBlocks;
				}
				function decodeMatrix(matrix) {
					var version = readVersion(matrix);
					if (!version) {
						return null;
					}
					var formatInfo = readFormatInformation(matrix);
					if (!formatInfo) {
						return null;
					}
					var codewords = readCodewords(matrix, version, formatInfo);
					var dataBlocks = getDataBlocks(codewords, version, formatInfo.errorCorrectionLevel);
					if (!dataBlocks) {
						return null;
					}
					var totalBytes = dataBlocks.reduce((a, b) => a + b.numDataCodewords, 0);
					var resultBytes = new Uint8ClampedArray(totalBytes);
					var resultIndex = 0;
					for (var _i = 0, dataBlocks_3 = dataBlocks; _i < dataBlocks_3.length; _i++) {
						var dataBlock = dataBlocks_3[_i];
						var correctedBytes = reedsolomon_1.decode(
							dataBlock.codewords,
							dataBlock.codewords.length - dataBlock.numDataCodewords,
						);
						if (!correctedBytes) {
							return null;
						}
						for (var i = 0; i < dataBlock.numDataCodewords; i++) {
							resultBytes[resultIndex++] = correctedBytes[i];
						}
					}
					try {
						return decodeData_1.decode(resultBytes, version.versionNumber);
					} catch (_a) {
						return null;
					}
				}
				function decode(matrix) {
					if (matrix == null) {
						return null;
					}
					var result = decodeMatrix(matrix);
					if (result) {
						return result;
					}
					for (var x = 0; x < matrix.width; x++) {
						for (var y = x + 1; y < matrix.height; y++) {
							if (matrix.get(x, y) !== matrix.get(y, x)) {
								matrix.set(x, y, !matrix.get(x, y));
								matrix.set(y, x, !matrix.get(y, x));
							}
						}
					}
					return decodeMatrix(matrix);
				}
				exports.decode = decode;
				/***/
			},
			undefined,
			undefined,
			/* 6 */ undefined,
			/* 7 */ undefined,
			/* 8 */ undefined,
			/* 9 */ undefined,
			/* 10 */ /* 11 */ /* 12 */
			/***/ (module, exports, __webpack_require__) => {
				Object.defineProperty(exports, '__esModule', { value: true });
				var BitMatrix_1 = __webpack_require__(0);
				var squareSize = 2;
				var alignmentPatternSize = 5;
				var versionInformationSize = 3;
				var minFinderPatternSize = 1;
				var maxFinderPatternSize = 3;
				var possibleDimensions = [
					[
						17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97, 101, 105, 109, 113, 117,
						121, 125, 129, 133, 137, 141, 145, 149, 153, 157, 161, 165, 169, 173, 177,
					],
					[],
					[],
					[],
				];
				function addPossibleDimensions(newDimensions) {
					for (var _i = 0, newDimensions_1 = newDimensions; _i < newDimensions_1.length; _i++) {
						var dimension = newDimensions_1[_i];
						possibleDimensions[0].push(dimension);
					}
					possibleDimensions[0].sort((a, b) => a - b);
				}
				function findMinMaxFromHistogram(histogram) {
					var min = null;
					var max = null;
					for (var _i = 0, histogram_1 = histogram; _i < histogram_1.length; _i++) {
						var _a = histogram_1[_i];
						var i = _a.i;
						var value = _a.value;
						if (value > 0) {
							min = i;
							break;
						}
					}
					for (var i = histogram.length - 1; i >= 0; i--) {
						if (histogram[i].value > 0) {
							max = histogram[i].i;
							break;
						}
					}
					return { min: min, max: max };
				}
				function findPossibleDimensions(histogram, minCount, maxCount) {
					if (minCount === void 0) {
						minCount = 2;
					}
					if (maxCount === void 0) {
						maxCount = 100;
					}
					var results = [];
					var possibleDimensions = [];
					for (var i = 0; i < histogram.length; i++) {
						if (histogram[i].value >= minCount && histogram[i].value <= maxCount) {
							possibleDimensions.push(histogram[i].i);
						}
					}
					possibleDimensions.sort((a, b) => a - b);
					for (var i = 0; i < possibleDimensions.length; i++) {
						var current = possibleDimensions[i];
						var next = possibleDimensions[i + 1];
						if (next && next - current <= 4) {
							results.push(Math.floor((current + next) / 2));
							i++;
						} else {
							results.push(current);
						}
					}
					return results;
				}
				function locate(matrix) {
					var _loop_1 = (squareSizeLevel) => {
						var size = squareSize * (squareSizeLevel + 1);
						var squares = [];
						for (var y = 0; y < matrix.height; y += size) {
							for (var x = 0; x < matrix.width; x += size) {
								var blackCount = 0;
								var totalCount = size * size;
								for (var dy = 0; dy < size && y + dy < matrix.height; dy++) {
									for (var dx = 0; dx < size && x + dx < matrix.width; dx++) {
										if (matrix.get(x + dx, y + dy)) {
											blackCount++;
										}
									}
								}
								var ratio = blackCount / totalCount;
								squares.push({ x: x, y: y, blackRatio: ratio });
							}
						}
						var histogram = [];
						for (var i = 0; i < 256; i++) {
							histogram[i] = { i: i, value: 0 };
						}
						for (var _i = 0, squares_1 = squares; _i < squares_1.length; _i++) {
							var ratio = squares_1[_i].blackRatio;
							var val = Math.floor(ratio * 255);
							histogram[val].value++;
						}
						var _a = findMinMaxFromHistogram(histogram);
						var min = _a.min;
						var max = _a.max;
						if (min === null || max === null || max - min < 10) {
							return 'continue';
						}
						var threshold = (min + max) / 2;
						var binarizedSquares = [];
						for (var _b = 0, squares_2 = squares; _b < squares_2.length; _b++) {
							var square = squares_2[_b];
							binarizedSquares.push(square.blackRatio * 255 > threshold ? 1 : 0);
						}
						var widthInSquares = Math.ceil(matrix.width / size);
						var blackRunHistogram = [];
						for (var i = 0; i < widthInSquares; i++) {
							blackRunHistogram[i] = { i: i, value: 0 };
						}
						for (var y = 0; y < Math.ceil(matrix.height / size); y++) {
							var runLength = 0;
							var inBlack = false;
							for (var x = 0; x < widthInSquares; x++) {
								if (binarizedSquares[y * widthInSquares + x]) {
									runLength++;
									inBlack = true;
								} else if (inBlack) {
									if (runLength >= minFinderPatternSize && runLength <= maxFinderPatternSize) {
										blackRunHistogram[x - 1].value++;
									}
									runLength = 0;
									inBlack = false;
								}
							}
							if (inBlack && runLength >= minFinderPatternSize && runLength <= maxFinderPatternSize) {
								blackRunHistogram[widthInSquares - 1].value++;
							}
						}
						for (var pixelColumn = 0; pixelColumn < Math.ceil(matrix.width / size); pixelColumn++) {
							var runLength = 0;
							var inBlack = false;
							for (var pixelRow = 0; pixelRow < Math.ceil(matrix.height / size); pixelRow++) {
								if (binarizedSquares[pixelRow * widthInSquares + pixelColumn]) {
									runLength++;
									inBlack = true;
								} else if (inBlack) {
									if (runLength >= minFinderPatternSize && runLength <= maxFinderPatternSize) {
										blackRunHistogram[pixelRow - 1].value++;
									}
									runLength = 0;
									inBlack = false;
								}
							}
							if (inBlack && runLength >= minFinderPatternSize && runLength <= maxFinderPatternSize) {
								blackRunHistogram[Math.ceil(matrix.height / size) - 1].value++;
							}
						}
						var possibleDimensions = findPossibleDimensions(blackRunHistogram);
						if (possibleDimensions.length >= 3) {
							possibleDimensions.sort((a, b) => a.position - b.position);
							var top = possibleDimensions[0];
							var left = possibleDimensions[1];
							var bottom = possibleDimensions[2];
							var dimension = Math.round((bottom - top) / 2) * 2 + top + bottom;
							if (possibleDimensions.length >= 4) {
								var right = possibleDimensions[3];
								if (right - left > dimension / 2) {
									return 'continue';
								}
							}
							addPossibleDimensions([dimension]);
						}
					};
					for (var squareSizeLevel = 0; squareSizeLevel < squareSize; squareSizeLevel++) {
						var state_1 = _loop_1(squareSizeLevel);
						if (state_1 === 'continue') continue;
					}
					for (var _i = 0, possibleDimensions_1 = possibleDimensions[0]; _i < possibleDimensions_1.length; _i++) {
						var dimension = possibleDimensions_1[_i];
						if (dimension > matrix.height || dimension > matrix.width) {
							continue;
						}
						var topLeft = findFinderPatternsAtPosition(matrix, 0, 0, dimension);
						if (!topLeft) {
							continue;
						}
						var topRight = findFinderPatternsAtPosition(matrix, dimension - 1, 0, dimension);
						if (!topRight) {
							continue;
						}
						var bottomLeft = findFinderPatternsAtPosition(matrix, 0, dimension - 1, dimension);
						if (!bottomLeft) {
							continue;
						}
						return [
							{
								dimension: dimension,
								topLeft: topLeft,
								topRight: topRight,
								bottomLeft: bottomLeft,
							},
						];
					}
					return null;
				}
				exports.locate = locate;
				/***/
			},
			/******/
		],
	),
);
