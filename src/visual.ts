import powerbi from "powerbi-visuals-api";

import {valueFormatter} from "powerbi-visuals-utils-formattingutils";
import {VisualDataPoint, VisualSettings, VisualViewModel, CustomPositive} from "./settings";
import * as d3 from "d3";
import {getMeasureIndex} from "./utils";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import DataView = powerbi.DataView;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;


type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;



window["requestAnimFrame"] = (function () {
    return window.requestAnimationFrame ||
        window["webkitRequestAnimationFrame"] ||
        window["mozRequestAnimationFrame"] ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

window["cancelAnimFrame"] = (function () {//cancelAnimationFrame Polyfill
    return window.cancelAnimationFrame ||
        window["webkitCancelAnimationFrame"] ||
        window["mozCancelAnimationFrame"] ||
        function (id) {
            window.clearTimeout(id);
        };
})();


export interface TextCategory {
    txtCategory: string;
    txtDataAbsoluteFormatted: string;
    txtDataRelativeFormatted: string;
    txtSplitChar: string[];
    txtSeparator: string;
    colText: string;
    colStatus: string[];
    posX: number;
    svgSel: Selection<SVGGraphicsElement>;
    sCategory: Selection<SVGElement>;
    sDataAbsoluteFormatted: Selection<SVGElement>;
    sDataRelativeFormatted: Selection<SVGElement>;
    sSplitChar: Selection<SVGElement>;
    sSeparator: Selection<SVGElement>;
    sHeaders: Selection<SVGElement>[];
    centeredLines: Selection<SVGElement>[];
    actualWidth: number;
    offset: number;
    categorySize: number;
    headerOffsets: number[];
    headerSizes: number[];
    statusSize: number;
    firstAbsoluteValue: Selection<SVGElement>;
}

//This is the function that is responsible for dealing with the data that is being passed in
function visualTransform(options: VisualUpdateOptions): VisualViewModel {
    let dataViews = options.dataViews;

    let viewModel: VisualViewModel = {
        dataPoints: [],
        settings: <VisualSettings>{},
    };

    if (!dataViews[0]) {
        return viewModel;
    }

    let visualSettings: VisualSettings = VisualSettings.parse<VisualSettings>(dataViews[0]);

    viewModel.settings = visualSettings;

    if (!dataViews[0]
        || !dataViews[0].categorical
        || !dataViews[0].categorical.values) {
        return viewModel;
    }

    // Set property limits
    if (visualSettings.text.pFontSize > 1000) {
        visualSettings.text.pFontSize = 1000;
    } else if (visualSettings.text.pFontSize < 0) {
        visualSettings.text.pFontSize = 0;
    }

    if (visualSettings.scroller.pSpeed > 1000) {
        visualSettings.scroller.pSpeed = 1000;
    } else if (visualSettings.scroller.pSpeed < 0) {
        visualSettings.scroller.pSpeed = 0;
    }

    let categorical = dataViews[0].categorical;
    let category = typeof (categorical.categories) === 'undefined' ? null : categorical.categories[0];
    let dataValue = categorical.values[0];

    let measureAbsoluteIndex = getMeasureIndex(categorical, "Measure Absolute");
    let measureDeviationStartIndex = getMeasureIndex(categorical, "Measure Deviation");

    // If we don't have a category, set a default one
    if (category === null) {
        category = {
            source: null,
            values: []
        };
        category.values = [];
        category.values.push("");
    }

    let visualDataPoints: VisualDataPoint[] = [];

    let countOfMeasures;

    //Change the loop to retrieve the multiple Deviation values instead of just the one
    for (let i = 0, len = Math.max(category.values.length, dataValue.values.length); i < len; i++) {
        const measureAbs = measureAbsoluteIndex > -1 ? <number>categorical.values[measureAbsoluteIndex].values[i] : null;
        const measureAbsForm = measureAbsoluteIndex > -1 ? valueFormatter.format(<number>categorical.values[measureAbsoluteIndex].values[i], dataViews[0].categorical.values.grouped()[0].values[measureAbsoluteIndex].source.format) : null;
        const measureDev = [];
        const measureDevForm = [];

        for (let j = measureDeviationStartIndex; j < categorical.values.length && j !== -1; j++) {
            measureDev.push(measureDeviationStartIndex > -1 ? <number>categorical.values[j].values[i] : null);
            measureDevForm.push(measureDeviationStartIndex > -1 ? valueFormatter.format(<number>categorical.values[j].values[i], dataViews[0].categorical.values.grouped()[0].values[j].source.format) : null);
        }

        visualDataPoints.push({
            categoryText: <string>category.values[i],
            measureAbsolute: measureAbs,
            measureDeviation: measureDev,
            measureAbsoluteFormatted: measureAbsForm,
            measureDeviationFormatted: measureDevForm,
        });

        if (i === 0) {
            //Verify that there are not more headers than there are measures given
            countOfMeasures = measureDev.length + ((measureAbs) ? 1 : 0);
        }
    }

    return {
        dataPoints: visualDataPoints,
        settings: visualSettings
    };
}

// noinspection JSUnusedGlobalSymbols
export class Visual implements IVisual {
    private host: IVisualHost;

    private svg: Selection<SVGElement>;
    private gWidth: number;
    private gHeight: number;

    private visualCurrentSettings: VisualSettings;
    private visualDataPoints: VisualDataPoint[];
    private selectionManager: ISelectionManager;

    private shouldRestartAnimFrame: boolean = false;
    private animationFrameLoopStarted: boolean = false;
    private animationLastTime: any = null;

    private dataView: DataView;
    private rect: Selection<SVGElement>;
    private sText: Selection<SVGGraphicsElement>;

    private activeSpeed: number = 0;
    private activeFontSize: number = 0;
    private activeTargetSpeed: number = 0;
    private totalTextWidth: number = 1000;
    private viewportWidth: number = 1000;
    private viewportHeight: number = 1000;
    private gPosX: number = 0;

    private arrTextCategories: TextCategory[];

    private static FontFamily: string = "Calibri";

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        this.svg = d3.select(options.element).append("svg");
        options.element.style.overflowX = "hidden";

        const that = this;
        this.rect = this.svg.append("rect")
            .on("mouseover", function () {
                that.activeTargetSpeed = 0;
            })
            .on("mouseout", function () {
                that.activeTargetSpeed = that.visualCurrentSettings.scroller.pSpeed;
            });

        this.sText = this.svg.append("text");
    }


    public update(options: VisualUpdateOptions) {
        this.shouldRestartAnimFrame = true;
        let viewModel: VisualViewModel = visualTransform(options);
        this.visualCurrentSettings = viewModel.settings;
        this.visualDataPoints = viewModel.dataPoints;

        let width = this.gWidth = options.viewport.width;
        let height = this.gHeight = options.viewport.height;

        if ((this.visualDataPoints.length === 0 && typeof (this.visualCurrentSettings.scroller) === 'undefined') || (this.visualDataPoints.length === 0 && (!this.visualCurrentSettings.text.pCustomText || this.visualCurrentSettings.text.pCustomText.length === 0))) {
            // if we have no data and no custom text we want to exit.
            this.svg.attr("visibility", "hidden");
            return;
        }

        this.svg.attr("visibility", "visible");

        this.svg
            .attr("width", width)
            .attr("height", height);

        d3.selectAll(".removable").remove();

        const dataViews = options.dataViews;
        if (!dataViews) return;

        this.dataView = options.dataViews[0];
        const that = this;
        this.shouldRestartAnimFrame = true;

        this.activeTargetSpeed = this.visualCurrentSettings.scroller.pSpeed;

        if (width < 0)
            width = 0;
        if (height < 0)
            height = 0;

        this.viewportWidth = width;
        this.viewportHeight = height;

        if (this.visualCurrentSettings.text.pShouldAutoSizeFont) {
            //Since there can be three levels, make the font size a third of the total screen height
            this.activeFontSize = height * 0.3;
        } else {
            this.activeFontSize = this.visualCurrentSettings.text.pFontSize;
        }
        if (this.activeFontSize < 0) {
            this.activeFontSize = 0;
        } else if (this.activeFontSize > 10000) {
            this.activeFontSize = 10000;
        }

        this.rect
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", width)
            .attr("height", height)
            .attr("fill", this.visualCurrentSettings.colour.pBgColor.solid.color)
        ;

        this.sText.remove();
        this.sText = this.svg.append("text")
            .on("mouseover", function () {
                that.activeTargetSpeed = 0;
            })
            .on("mouseout", function () {
                that.activeTargetSpeed = that.visualCurrentSettings.scroller.pSpeed;
            });

        this.sText
            .attr("y", height * 0.5 + this.activeFontSize * 0.30)
            .attr("font-family", Visual.FontFamily)
            .attr("font-size", this.activeFontSize + "px")
            .attr("fill", "#ffffff");

        // Create text from data
        this.CreateTextFromData(viewModel);

        this.sText.each(function () {
            that.totalTextWidth = this.getBBox().width;
        });

        if (!this.animationFrameLoopStarted) {
            this.animationFrameLoopStarted = true;
            this.animationStep();
        }
    }

    /**This is the method that is used to create the text from the already formatted data. This
     * is where we will format the data and not retrieve it.
     */
    private CreateTextFromData(viewModel: VisualViewModel) {
        debugger;
        if (this.gPosX === 0) {
            this.gPosX = this.viewportWidth;
        }

        if (this.arrTextCategories != null && this.arrTextCategories.length > 0) {
            for (let i = 0; i < this.arrTextCategories.length; i++) {
                if (this.arrTextCategories[i].svgSel != null) {
                    this.arrTextCategories[i].svgSel.remove();
                    this.arrTextCategories[i].svgSel = null;
                }
            }
            this.arrTextCategories.splice(0, this.arrTextCategories.length);
        }

        this.arrTextCategories = [];

        const sText = this.visualCurrentSettings.text.pCustomText;
        if (sText && sText.length > 0) {
            // We have a custom text.
            let newCat: TextCategory = {
                txtCategory: sText,
                txtDataAbsoluteFormatted: "",
                txtDataRelativeFormatted: "",
                txtSeparator: "",
                txtSplitChar: [],
                colStatus: [this.visualCurrentSettings.colour.pBgColor.solid.color],
                colText: this.visualCurrentSettings.colour.pForeColor.solid.color,
                posX: this.viewportWidth + 10,
                svgSel: null,
                sCategory: null,
                sDataAbsoluteFormatted: null,
                sDataRelativeFormatted: null,
                sSeparator: null,
                sSplitChar: null,
                actualWidth: 0,
                offset: 0,
                categorySize: 0,
                sHeaders: null,
                headerOffsets: [],
                headerSizes: [],
                statusSize: 0,
                firstAbsoluteValue: null,
                centeredLines: []
            };
            newCat.posX = this.gPosX;
            this.arrTextCategories.push(newCat);
            return;
        }

        //This is the part of the code that will create the text based on the values of the data
        for (let i = 0; i < viewModel.dataPoints.length; i++) {
            const category = viewModel.dataPoints[i].categoryText || "Null";

            const bShouldRenderAbsolute = viewModel.dataPoints[i].measureAbsolute !== null;
            const bShouldRenderRelative = viewModel.dataPoints[i].measureDeviation !== null;

            let dataAbsolute, dataAbsoluteFormatted, dataRelative, dataRelativeFormatted;

            if (bShouldRenderAbsolute) {
                dataAbsolute = viewModel.dataPoints[i].measureAbsolute;
                dataAbsoluteFormatted = viewModel.dataPoints[i].measureAbsoluteFormatted;
            }

            if (bShouldRenderRelative) {
                dataRelative = viewModel.dataPoints[i].measureDeviation;
                dataRelativeFormatted = viewModel.dataPoints[i].measureDeviationFormatted;
            }

            // Status Color
            const colorStatus = [];
            const colorText = this.visualCurrentSettings.colour.pForeColor.solid.color;
            const splitChar = [];

            /**
             * This for-loop will determine and set the colour and symbol for each measure within the
             * deviation.
             */
            for (let j = 0; j < viewModel.dataPoints[i].measureDeviation.length; j++) {
                if (bShouldRenderRelative) {
                    //Part of the code that determines if they outcome should be positive or negative
                    if (this.isPositiveValue(dataRelative[j], viewModel.settings, j)) {
                        if (this.visualCurrentSettings.status.pShouldUsePosNegColoring) {
                            colorStatus.push(this.visualCurrentSettings.colour.positiveColour.solid.color);
                        } else {
                            colorStatus.push(this.visualCurrentSettings.colour.pForeColor.solid.color);
                        }

                        if (this.visualCurrentSettings.status.pShouldIndicatePosNeg) {
                            splitChar.push(" ▲ ");
                        } else {
                            splitChar.push(" ")
                        }
                    } else {
                        if (this.visualCurrentSettings.status.pShouldUsePosNegColoring) {
                            colorStatus.push(this.visualCurrentSettings.colour.negativeColour.solid.color);
                        } else {
                            colorStatus.push(this.visualCurrentSettings.colour.pForeColor.solid.color);
                        }

                        if (this.visualCurrentSettings.status.pShouldIndicatePosNeg) {
                            splitChar.push(" ▼ ");
                        } else {
                            splitChar.push(" ")
                        }
                    }
                }
            }

            const newCat: TextCategory = {
                txtCategory: category,
                txtDataAbsoluteFormatted: dataAbsoluteFormatted,
                txtDataRelativeFormatted: dataRelativeFormatted,
                txtSeparator: ".....",
                txtSplitChar: splitChar,
                colStatus: colorStatus,
                colText: colorText,
                posX: this.viewportWidth + 10,
                svgSel: null,
                sCategory: null,
                sDataAbsoluteFormatted: null,
                sDataRelativeFormatted: null,
                sSeparator: null,
                sSplitChar: null,
                actualWidth: 0,
                offset: 0,
                categorySize: 0,
                sHeaders: null,
                headerOffsets: [],
                headerSizes: [],
                statusSize: 0,
                firstAbsoluteValue: null,
                centeredLines: []
            };

            if (i === 0) {
                newCat.posX = this.gPosX;
            }

            this.arrTextCategories.push(newCat);
        }
    }

    public getMetaDataColumn(dataView: DataView) {
        let retValue = null;
        if (dataView && dataView.metadata && dataView.metadata.columns) {
            let i = 0;
            const ilen = dataView.metadata.columns.length;
            for (; i < ilen; i++) {
                const column = dataView.metadata.columns[i];
                if (column.isMeasure) {
                    retValue = column;
                    if ((<any>column.roles).Values === true) {
                        break;
                    }
                }
            }
        }
        return retValue;
    }

    private isPositiveValue(data, settings, index) {
        let customArray = [settings.determinePositive.custom, settings.determinePositive.custom2];
        if (customArray[index]?.use === false)
            return data >= 0;

        const condition = this.combineConditionAndValue(customArray[index].when, customArray[index].value);

        if (condition !== undefined) {
            const func = new Function("x", "return x " + condition);
            return func(data);
        }

        return data >= 0;
    }

    //Helper function that will simply combine the values of the when and value of the custom positive format.
    //If either aren't defined, then undefined is returned
    private combineConditionAndValue(condition, value) {
        if (condition === undefined || value === undefined || value.trim().length === 0) {
            return undefined;
        }

        return " " + condition + " " + value;
    }


    public getMetaDataColumnForMeasureIndex(dataView: DataView, measureIndex: number) {
        let addCol = 0;

        if (dataView && dataView.metadata && dataView.metadata.columns) {
            for (let i = 0; i < dataView.metadata.columns.length; i++) {
                if (!dataView.metadata.columns[i].isMeasure)
                    addCol++;
            }

            const column = dataView.metadata.columns[measureIndex + addCol];
            if (column.isMeasure) {
                return column;
            }
        }
        return null;
    }

    // Right settings panel
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        const settings: VisualSettings = this.visualCurrentSettings || <VisualSettings>VisualSettings.getDefault();
        return VisualSettings.enumerateObjectInstances(settings, options);
    }

    public destroy(): void {
        window["cancelAnimFrame"](this.animationId);//removes animation callback.
    }

    public animationFrameLoopExited() {
        if (this.shouldRestartAnimFrame) {
            this.shouldRestartAnimFrame = false;
            this.animationStep();
        }
    }

    private animationId: number = 0;//add a new property to keep id of animation callback.

    public animationStep() {
        if (this.shouldRestartAnimFrame) {
            this.animationFrameLoopExited();
            return;
        }
        const that = this;
        //keep id of animation callback to animationId.
        this.animationId = window["requestAnimFrame"](function () {
            that.animationStep();
        });

        this.animationUpdateStep();
    }

    public animationUpdateStep() {
        if (!this.arrTextCategories) {
            return;
        }

        let s: TextCategory;
        let i;
        let j;

        const now = new Date().getTime(), dt = now - (this.animationLastTime || now);
        this.animationLastTime = now;

        let curSettings = this.visualCurrentSettings;

        const pIntervalStatic = dt * 1.2; // this.pInterval_get(this.dataView)
        for (i = 0; i < this.arrTextCategories.length; i++) {
            s = this.arrTextCategories[i];
            if (s.svgSel != null) {
                continue;
            }

            if (s.posX < this.viewportWidth) {
                let bShouldRenderAbsolute = false;
                let bShouldRenderRelative = false;

                if (this.visualDataPoints.length > 0) {
                    bShouldRenderAbsolute = !!(this.visualDataPoints[0].measureAbsolute);
                    bShouldRenderRelative = this.visualDataPoints[0].measureDeviation.length > 0;
                }

                const y = this.viewportHeight * 0.5 + 3 * (this.activeFontSize * 0.4);

                s.svgSel = this.svg.append("text").attr("x", s.posX);
                s.svgSel.attr("font-family", Visual.FontFamily).attr("font-size", this.activeFontSize + "px");

                let className = `.category-${i}`;

                d3.selectAll(className).remove();

                s.centeredLines[0] = this.svg.append("line").classed("removable", true).classed(className, true);
                s.centeredLines[1] = this.svg.append("line").classed("removable", true).classed(className, true);

                const that = this;
                s.svgSel
                    .on("mouseover", function () {
                        that.activeTargetSpeed = 0;
                    })
                    .on("mouseout", function () {
                        that.activeTargetSpeed = curSettings.scroller == null ? 0 : curSettings.scroller.pSpeed;
                    });

                s.sCategory = s.svgSel.append("tspan")
                    .text(s.txtCategory)
                    .attr("y", y)
                    .style("fill", s.colText);

                //Get the size of the category that will be used to center it
                s.svgSel.each(function () {
                    s.categorySize = this.getBBox().width;
                });

                const headers = this.visualCurrentSettings.headers;
                const headerArray = [headers.header1, headers.header2, headers.header3];
                s.sHeaders = [];
                s.headerSizes = [];

                for (j = 0; j < headerArray.length; j++) {
                    let header = headerArray[j];

                    if (header == null)
                        continue;
                    //Retrieve the current size of the text element before we append the next header (used to get header size)
                    s.svgSel.each(function () {
                        s.offset = this.getBBox().width;
                    });

                    s.sHeaders.push(s.svgSel.append("tspan")
                        .text("" + header)
                        .attr("y", y)
                        .style("fill", s.colText)
                    );

                    //Using the offset we calculate the size of the header that was just appended
                    s.svgSel.each(function () {
                        s.headerSizes.push(this.getBBox().width - s.offset);
                    });
                }

                //Get the current size of the text (to be removed from total height)
                s.svgSel.each(function () {
                    s.offset = this.getBBox().width;
                });

                //We need to calculate the offsets used for the headers in order for them to be centered above their values
                let offsetForHeaders = s.offset;
                s.headerOffsets = [];

                if (bShouldRenderAbsolute) {
                    s.sDataAbsoluteFormatted = s.svgSel.append("tspan")
                        .text(s.txtDataAbsoluteFormatted)
                        .attr("y", y)
                        .style("fill", s.colText)
                    ;

                    //Get the offset for the first header (being the absolute data)
                    s.svgSel.each(function () {
                        s.headerOffsets.push(this.getBBox().width - offsetForHeaders);
                        offsetForHeaders = this.getBBox().width;
                    });
                }

                if (bShouldRenderRelative) {
                    for (j = 0; j < s.txtDataRelativeFormatted.length; j++) {
                        const temp = s.svgSel.append("tspan")
                            .text(s.txtSplitChar[j])
                            .attr("y", y)
                            .style("fill", s.colStatus[j])
                        ;

                        if (j === 0) {
                            s.firstAbsoluteValue = temp;
                        }

                        //Retrieves the size of the triangle (status + or -)
                        s.svgSel.each(function () {
                            s.statusSize = this.getBBox().width - offsetForHeaders;
                        });

                        let colText = s.colText;

                        if (curSettings.status.pShouldUseTextColoring) {
                            colText = s.colStatus[j];
                        }

                        s.svgSel.append("tspan")
                            .text(s.txtDataRelativeFormatted[j])
                            .attr("y", y)
                            .style("fill", colText)
                        ;

                        s.svgSel.each(function () {
                            s.headerOffsets.push(this.getBBox().width - offsetForHeaders - s.statusSize);
                            offsetForHeaders = this.getBBox().width;
                        });
                    }
                }

                const offsetOfCategoryAndHeaders = s.offset;

                let widthBeforeSpiltChar;

                s.svgSel.each(function () {
                    widthBeforeSpiltChar = this.getBBox().width;
                });

                s.sSplitChar = s.svgSel.append("tspan")
                    .text(s.txtSeparator)
                    .attr("y", y)
                    .style("fill", function () {
                        return curSettings.scroller == null ? "#abcdef" : curSettings.colour.pBgColor.solid.color;
                    })
                ;

                s.svgSel.each(function () {
                    //Don't add the offset if it is the header being displayed
                    let offset = this.getBBox().height;

                    for (let i = 0; i < s.sHeaders.length; i++) {
                        s.sHeaders[i].attr("y", y - offset);
                    }

                    //Keep track of the category height and y position to use it to place the lines
                    const categoryHeight = y - this.getBBox().height;
                    offset = this.getBBox().height;
                    s.sCategory.attr("y", categoryHeight);

                    const temp = this.getBBox().height;
                    const yLines = categoryHeight - ((temp - offset) * 0.4);
                    s.centeredLines[0].attr("y1", yLines).attr("y2", yLines);
                    s.centeredLines[1].attr("y1", yLines).attr("y2", yLines);

                    //The actual width of the element will be the largest element between the different levels
                    s.actualWidth = d3.max([widthBeforeSpiltChar - offsetOfCategoryAndHeaders,
                        s.categorySize
                    ]);

                    //Use s.offset to get the size of the split char in order to take it into consideration for the centering
                    s.offset = this.getBBox().width - widthBeforeSpiltChar;
                });

                if (i > 0) {
                    const sPrev: TextCategory = this.arrTextCategories[i - 1];
                    s.posX = sPrev.posX + sPrev.actualWidth;
                }

                // The below is for handling if we have less texts than the full space - then we don't want to put the text in the middle...
                if (s.posX < this.viewportWidth) {
                    s.posX = this.viewportWidth;
                }

                // Update all descendants with the position and width of the newly added one.
                if (i < this.arrTextCategories.length - 1) {
                    for (let t = i + 1; t < this.arrTextCategories.length; t++) {
                        const sNext: TextCategory = this.arrTextCategories[t];
                        sNext.posX = s.posX + s.actualWidth + s.offset;
                    }
                }
            }
        }

        this.activeSpeed += (this.activeTargetSpeed - this.activeSpeed) * 0.5;
        if (this.activeSpeed < 0) {
            this.activeSpeed = 0;
        }
        if (this.activeSpeed > 100) {
            this.activeSpeed = 100;
        }

        this.gPosX -= this.activeSpeed * 8 * pIntervalStatic / 100;
        if (this.gPosX < -5000) {
            this.gPosX = 0;
        }

        for (i = 0; i < this.arrTextCategories.length; i++) {
            s = this.arrTextCategories[i];
            s.posX -= this.activeSpeed * 8 * pIntervalStatic / 100;
            if (s.svgSel == null) {
                continue;
            }
            s.svgSel.attr("x", s.posX);
            if (s.actualWidth !== s.categorySize) {
                //Calculate the width of the element without the spacing
                const actualWidth = s.actualWidth;

                //Center the category
                s.sCategory.attr("x", s.posX + (actualWidth - s.categorySize) / 2);

                const offSetForCategory = 8;

                //Fill up the space next to the category with lines
                s.centeredLines[0]
                    .attr("x1", s.posX)
                    .attr("x2", s.posX + ((actualWidth - s.categorySize) / 2) - offSetForCategory)
                    .attr("stroke-width", this.activeFontSize / 10)
                    .attr("stroke", this.visualCurrentSettings.colour.pForeColor.solid.color);
                s.centeredLines[1]
                    .attr("x1", s.posX + ((actualWidth + s.categorySize) / 2) + offSetForCategory)
                    .attr("x2", s.posX + actualWidth)
                    .attr("stroke-width", this.activeFontSize / 10)
                    .attr("stroke", this.visualCurrentSettings.colour.pForeColor.solid.color);
            }
            let posX = s.posX;
            if (s.actualWidth === s.categorySize) {
                posX += s.categorySize / 2;

                //Takes into consideration the size of the headers
                for (j = 0; j < s.headerOffsets.length; j++) {
                    posX -= s.headerOffsets[j] / 2;
                }

                //Takes into consideration the size of the icons (triangles for positive or negative)
                if (s.txtDataRelativeFormatted !== null) {
                    for (j = 0; j < s.txtDataRelativeFormatted.length; j++) {
                        posX -= s.statusSize / 2;
                    }
                }
            }
            if (s.sDataAbsoluteFormatted !== null) {
                s.sDataAbsoluteFormatted.attr("x", posX);
            } else if (s.firstAbsoluteValue !== null) {
                s.firstAbsoluteValue.attr("x", posX);
            }
            if (s.headerOffsets !== null) {
                let headerSize = 0;

                //If the first information is not the absolute data, then we need to take into consideration the status size
                if (s.sDataAbsoluteFormatted === null)
                    headerSize = s.statusSize;

                if (s.sHeaders !== null) {
                    for (j = 0; j < s.sHeaders.length; j++) {
                        s.sHeaders[j].attr("x", posX + headerSize + (s.headerOffsets[j] / 2) - (s.headerSizes[j] / 2));

                        //Append the offset of the previous header and the status symbol (triangle) to the total offset
                        headerSize += s.headerOffsets[j] + s.statusSize;
                    }
                }
            }
        }

        // Remove elements outside the left of the viewport
        for (i = 0; i < this.arrTextCategories.length; i++) {
            s = this.arrTextCategories[i];

            if ((s.posX + s.actualWidth) >= 0) {
                continue;
            }

            // Entire element is outside, delete it (start over)
            const r1: TextCategory = this.arrTextCategories.splice(i, 1)[0];
            if (r1.svgSel != null) {
                r1.svgSel.remove();
            }
            r1.svgSel = null;
            r1.actualWidth = 0;

            r1.posX = 0;
            if (this.arrTextCategories.length > 0) {
                const sLast: TextCategory = this.arrTextCategories[this.arrTextCategories.length - 1];
                r1.posX = sLast.posX + 10;
            } else {
                r1.posX = this.viewportWidth;
            }
            if (r1.posX < this.viewportWidth) {
                r1.posX = this.viewportWidth;
            }

            this.arrTextCategories.push(r1);

            break;
        }
    }

}
