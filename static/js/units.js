/**
 * IndCAD Units Utility
 * Handles AutoCAD-style unit formatting and parsing.
 */

const Units = {
    // Current settings (updated by app)
    settings: {
        unitType: 'decimal',
        unitPrecision: 2,
        angleType: 'decimalDegrees',
        anglePrecision: 0
    },

    updateSettings(newSettings) {
        Object.assign(this.settings, newSettings);
    },

    /**
     * Format a linear distance based on settings.
     */
    formatLinear(val) {
        if (typeof val !== 'number') return "0.00";

        switch (this.settings.unitType) {
            case 'architectural':
                return this._toArchitectural(val);
            case 'engineering':
                return this._toEngineering(val);
            case 'fractional':
                return this._toFractional(val);
            case 'scientific':
                return val.toExponential(this.settings.unitPrecision);
            case 'decimal':
            default:
                return val.toFixed(this.settings.unitPrecision);
        }
    },

    /**
     * Format an angle based on settings.
     */
    formatAngular(val) {
        // Normalize 0-360
        val = (val % 360 + 360) % 360;

        switch (this.settings.angleType) {
            case 'degMinSec':
                return this._toDMS(val);
            case 'grads':
                return (val * 400 / 360).toFixed(this.settings.anglePrecision) + 'g';
            case 'radians':
                return (val * Math.PI / 180).toFixed(this.settings.anglePrecision) + 'r';
            case 'surveyor':
                return this._toSurveyor(val);
            case 'decimalDegrees':
            default:
                return val.toFixed(this.settings.anglePrecision) + '°';
        }
    },

    /**
     * Parse a linear string input (e.g., 5'6", 1-1/2, 10.5).
     */
    parseLinear(str) {
        if (!str) return 0;
        str = str.trim().toLowerCase();

        // Handle architectural/engineering feet/inches
        if (str.includes("'") || str.includes('"')) {
            let totalInches = 0;
            const feetMatch = str.match(/(\d+(?:\.\d+)?)'/);
            const inchMatch = str.match(/(\d+(?:\.\d+)?|(?:\d+[\s-])?\d+\/\d+)"/);

            if (feetMatch) totalInches += parseFloat(feetMatch[1]) * 12;
            if (inchMatch) {
                let inchStr = inchMatch[1];
                if (inchStr.includes('/') || inchStr.includes(' ')) {
                    totalInches += this._parseFraction(inchStr);
                } else {
                    totalInches += parseFloat(inchStr);
                }
            }
            return totalInches;
        }

        // Handle fractions without units
        if (str.includes('/')) {
            return this._parseFraction(str);
        }

        return parseFloat(str) || 0;
    },

    // ──────────────────────── Internal Helpers ────────────────────────

    _toArchitectural(val) {
        // val is assumed to be in inches for architectural/engineering
        const feet = Math.floor(Math.abs(val) / 12);
        const inches = Math.abs(val) % 12;
        const wholeInches = Math.floor(inches);
        const fraction = inches - wholeInches;

        let fracStr = this._getFractionStr(fraction, this.settings.unitPrecision);
        let result = (val < 0 ? "-" : "") + feet + "'-" + wholeInches;
        if (fracStr) result += " " + fracStr;
        result += '"';
        return result;
    },

    _toEngineering(val) {
        const feet = Math.floor(Math.abs(val) / 12);
        const inches = Math.abs(val) % 12;
        return (val < 0 ? "-" : "") + feet + "'-" + inches.toFixed(this.settings.unitPrecision) + '"';
    },

    _toFractional(val) {
        const whole = Math.floor(Math.abs(val));
        const frac = Math.abs(val) - whole;
        let fracStr = this._getFractionStr(frac, this.settings.unitPrecision);
        let result = (val < 0 ? "-" : "") + whole;
        if (fracStr) result += " " + fracStr;
        return result;
    },

    _getFractionStr(val, precision) {
        if (val < 0.000001) return "";
        const maxDenom = Math.pow(2, Math.max(1, precision));
        const num = Math.round(val * maxDenom);
        if (num === 0) return "";
        if (num === maxDenom) return "1"; // Handle rounding up to 1

        let n = num, d = maxDenom;
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const divisor = gcd(n, d);
        return (n / divisor) + "/" + (d / divisor);
    },

    _parseFraction(str) {
        // Handle 1 1/2 or 1-1/2 or 3/4
        const parts = str.split(/[\s-]/);
        if (parts.length === 2) {
            const whole = parseFloat(parts[0]);
            const fracParts = parts[1].split('/');
            return whole + (parseFloat(fracParts[0]) / parseFloat(fracParts[1]));
        } else if (parts[0].includes('/')) {
            const fracParts = parts[0].split('/');
            return parseFloat(fracParts[0]) / parseFloat(fracParts[1]);
        }
        return parseFloat(str) || 0;
    },

    _toDMS(val) {
        const deg = Math.floor(val);
        const minFull = (val - deg) * 60;
        const min = Math.floor(minFull);
        const sec = ((minFull - min) * 60).toFixed(this.settings.anglePrecision);
        return `${deg}°${min}'${sec}"`;
    },

    _toSurveyor(val) {
        // Basic surveyor notation (N/S E/W)
        // This is a simplified version
        let bearing = "";
        let angle = val;
        if (val <= 90) {
            bearing = "N " + val.toFixed(this.settings.anglePrecision) + "° E";
        } else if (val <= 180) {
            angle = 180 - val;
            bearing = "S " + angle.toFixed(this.settings.anglePrecision) + "° E";
        } else if (val <= 270) {
            angle = val - 180;
            bearing = "S " + angle.toFixed(this.settings.anglePrecision) + "° W";
        } else {
            angle = 360 - val;
            bearing = "N " + angle.toFixed(this.settings.anglePrecision) + "° W";
        }
        return bearing;
    }
};
