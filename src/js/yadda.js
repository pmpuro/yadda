/*
 * Copyright 2010 Acuminous Ltd / Energized Work Ltd
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

Yadda = function(steps) {

    this.steps = steps ? steps : new Steps();

    this.prime = function(steps) {
        this.steps = steps
    }

    this.yadda = function(text, executionCtx) {
        if (text == undefined) {
            return this;
        } else if (YaddaUtil.isArray(text)) {
            for (var i = 0; i < text.length; i++) {
                this.yadda(text[i], executionCtx);
            }
        } else {
            steps.runStep(text, executionCtx);
        }        
    }
}

YaddaUtil = {
    isArray: function(obj) {
        return (obj.constructor.toString().indexOf("Array") != -1)
    },
    toArray: function(obj) {
        return Array.prototype.slice.call(obj);
    },
    escapeRegex: function(text) {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }     
}

Steps = function(options, existing_steps) {

    this.options = options ? options : {};
    this.steps = existing_steps ? existing_steps : {};

    this.importSteps = function(steps) {

        for (var key in steps.steps) {
            var candidateStep = steps.steps[key];
            this.addStep(candidateStep.template, candidateStep.callable, candidateStep.stepContext);
        };

        return this;
    };

    this.given = function(template, callable, stepContext) {
        return this.addStep("(?:[Gg]iven|[Aa]nd|[Bb]ut) " + template, callable, stepContext);
    };

    this.when = function(template, callable, stepContext) {
        return this.addStep("(?:[Ww]hen|[Aa]nd|[Bb]ut) " + template, callable, stepContext);
    };

    this.then = function(template, callable, stepContext) {
        return this.addStep("(?:[Tt]hen|[Ee]xpect|[Aa]nd|[Bb]ut) " + template, callable, stepContext);
    };
    
    this.addStep = function(template, callable, stepContext) {
        
        if (YaddaUtil.isArray(template)) {
            return this.addSteps(template, callable, stepContext);
        }

        if (this.options.prefix) {
            template = this.subsitutePlaceholdersWithWildcards(template);
            console.log(template);
        }

        var candidateStep = new Step(template, callable, stepContext).init();
        var conflictingStep = this.steps[candidateStep.template];

        if (conflictingStep) {
            throw '[' + candidateStep.template + '] conflicts with [' + conflictingStep.template + ']';
        }

        this.steps[candidateStep.template] = candidateStep;

        return this;
    };

    this.addSteps = function(templates, callable, stepContext) {
        for (var i = 0; i < templates.length; i++) {
            this.addStep(templates[i], callable, stepContext);
        }      

        return this;  
    };

    this.subsitutePlaceholdersWithWildcards = function(template) {
        var escapedPrefix = YaddaUtil.escapeRegex(this.options.prefix);
        var allPlaceholders = new RegExp('(^|[^\\\\])' + escapedPrefix + '[^ ]+', 'g');
        return template.replace(allPlaceholders, '$1(.+)');
    };

    this.findStep = function(text) {
        var highScore = -1;
        var bestMatch;
        var alternativeMatch;

        for (var template in this.steps) {

            var candidateStep = this.steps[template];            
            var candidateScore = candidateStep.score(text);

            if (candidateScore > highScore) {
                highScore = candidateScore;
                bestMatch = candidateStep;
                alternativeMatch = undefined;
            } else if (candidateScore == highScore) {
                alternativeMatch = candidateStep;
            }
        }

        if (bestMatch && alternativeMatch) {
           throw 'Unable to determine which of [' + bestMatch.template + '] or [' + alternativeMatch.template + '] is more likely for [' + text + ']';
        }

        return bestMatch;
    };

    this.runStep = function(text, executionCtx) {
        var step = this.findStep(text);
        if (!step) {
            throw 'Undefined step [' + text + ']';
        }
        return step.run(text, executionCtx);
    };
};

Step = function(template, callable, stepCtx) {

    this.stepCtx = stepCtx ? stepCtx : {};
    this.allRegExGroups = new RegExp('\\([^\\)]+\\)', 'g');
    this.template = template;
    this.callable = callable;
    this.scoringTemplate;
    this.parsedArguments = [];

    this.init = function() {
        this.createScoringTemplate();
        this.stepCtx['_step'] = this;
        return this;
    };

    this.createScoringTemplate = function() {
        this.scoringTemplate = this.template.replace(/[^\w\s]/g, '');
    }

    this.score = function(text) {
        var score = -1;
        var match = text.match(this.template);
        if (match) {
            score = 1000 - new LevenshteinDistance(text, this.scoringTemplate).calculate();
        }
        return score;
    };

    this.run = function(text, executionCtx) {
        this.parseArguments(text);
        var ctx = {};
        for (key in this.stepContext) {
            var entry = this.stepContext[key];
            ctx[key] = entry;
        }
        for (key in executionCtx) {
            var entry = executionCtx[key]
            ctx[key] = entry;
        }
        this.bind(this.callable, ctx)(this.parsedArguments);
    };

    this.bind = function(callable, scope) {
        return function() {
            return callable.apply(scope, arguments[0]);
        }
    };

    this.parseArguments = function(text) {
        var match = text.match(this.template);
        if (match) {
            this.parsedArguments = match.splice(1, match.length - 1);
        }
    };
};


LevenshteinDistance = function(s1, s2) {
    this.s1 = s1;
    this.s2 = s2;
    this.distanceTable;

    this.initDistanceTable = function() {

        var x = this.s1.length;
        var y = this.s2.length;

        this.distanceTable = new Array(x + 1);

        for (i = 0; i <= x; i++) {
            this.distanceTable[i] = new Array(y + 1);
        }

        for (var i = 0; i <= x; i++) {
            for (var j = 0; j <= y; j++) {
                this.distanceTable[i][j] = 0;
            }
        }

        for (var i = 0; i <= x; i++) {
            this.distanceTable[i][0] = i;
        }

        for (var j = 0; j <= y; j++) {
            this.distanceTable[0][j] = j;
        }
    };

    this.calculate = function() {

        this.initDistanceTable();

        if (this.s1 == this.s2) {
            return 0;
        }

        var s1Length = this.s1.length;
        var s2Length = this.s2.length;

        for (var j = 0; j < s2Length; j++) {
            for (var i = 0; i < s1Length; i++) {
                if (this.s1[i] == this.s2[j]) {
                    this.distanceTable[i+1][j+1] = this.distanceTable[i][j];
                } else {
                    var deletion = this.distanceTable[i][j+1] + 1;
                    var insertion = this.distanceTable[i+1][j] + 1;
                    var substitution = this.distanceTable[i][j] + 1;

                    this.distanceTable[i+1][j+1] = Math.min(substitution, deletion, insertion)
                }
            }
        }

        return this.distanceTable[s1Length][s2Length];
    };
};