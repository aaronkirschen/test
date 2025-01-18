window.custom = function() {
    'use strict';

    const defaultConfig = {
        LOG_LEVEL: "debug",
        MAX_RETRIES: 10,
        RETRY_DELAY: 500, // milliseconds
    };

    let config = {...defaultConfig};
    let retryCount = 0;

    const log = {
        _shouldLog(level) {
            const levels = ["debug", "info", "warn", "error", "none"];
            return levels.indexOf(level) >= levels.indexOf(config.LOG_LEVEL);
        },
        debug(...args) { if (this._shouldLog("debug")) console.debug('[CustomJS]', ...args); },
        info(...args) { if (this._shouldLog("info")) console.info('[CustomJS]', ...args); },
        warn(...args) { if (this._shouldLog("warn")) console.warn('[CustomJS]', ...args); },
        error(...args) { if (this._shouldLog("error")) console.error('[CustomJS]', ...args); }
    };

    function validateTrajectory(trajectory) {
        return trajectory && 
               typeof trajectory === "object" && 
               "uuid" in trajectory && 
               "steps" in trajectory;
    }

    function getTrajectory() {
        // First, check if hybrid.forms exists
        if (!window.hybrid?.forms?.validations) {
            log.debug('hybrid.forms.validations not found');
            return null;
        }

        function searchForTrajectory(obj, path = '') {
            if (!obj || typeof obj !== 'object') return null;
            
            // Check if this object has questions with trajectory
            if (obj.questions) {
                for (const [key, entry] of Object.entries(obj.questions)) {
                    try {
                        if (entry?.item_type === "fr" && entry?.text) {
                            const parsed = JSON.parse(entry.text);
                            if (validateTrajectory(parsed)) {
                                log.debug(`Found trajectory at ${path}.questions.${key}`);
                                return parsed;
                            }
                        }
                    } catch (error) {
                        log.debug(`Failed to parse entry at ${path}.questions.${key}`, error);
                    }
                }
            }

            // Recursively search nested objects
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const result = searchForTrajectory(obj[key], `${path}.${key}`);
                    if (result) return result;
                }
            }

            return null;
        }

        return searchForTrajectory(window.hybrid.forms.validations);
    }

    function attemptInitialization() {
        log.debug(`Attempt ${retryCount + 1} of ${config.MAX_RETRIES}`);
        
        const trajectoryData = getTrajectory();
        
        if (trajectoryData) {
            log.info('Successfully found trajectory data:', trajectoryData);
            // Do something with the trajectory data here
            return true;
        }
        
        retryCount++;
        
        if (retryCount < config.MAX_RETRIES) {
            log.debug(`Trajectory not found, retrying in ${config.RETRY_DELAY}ms...`);
            setTimeout(attemptInitialization, config.RETRY_DELAY);
            return false;
        } else {
            log.error('Failed to find trajectory data after maximum retries');
            return false;
        }
    }

    function initialize() {
        log.info('Initializing CustomJS');
        retryCount = 0;
        attemptInitialization();
    }

    // Add both DOMContentLoaded and load event listeners
    if (document.readyState === "complete") {
        log.debug('Document already complete, initializing immediately');
        initialize();
    } else {
        log.debug('Document not ready, adding event listeners');
        document.addEventListener("DOMContentLoaded", () => {
            log.debug('DOMContentLoaded fired');
            initialize();
        });
        window.addEventListener("load", () => {
            log.debug('Window load fired');
            initialize();
        });
    }
};
