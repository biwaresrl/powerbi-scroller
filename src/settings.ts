import powerbi from "powerbi-visuals-api";
import {DataViewObjectsParser} from "powerbi-visuals-utils-dataviewutils/lib/dataViewObjectsParser";

export class VisualDataPoint {
    categoryText: string;
    measureAbsolute: number;
    measureDeviation: number[];
    measureAbsoluteFormatted: string;
    measureDeviationFormatted: string[];
}

export class VisualViewModel {
    dataPoints: VisualDataPoint[];
    settings: VisualSettings;
}

export class VisualSettings extends DataViewObjectsParser {
    scroller: ScrollerSettings = new ScrollerSettings();

    status: StatusSettings = new StatusSettings();

    text: TextSettings = new TextSettings();

    colour: ColorSettings = new ColorSettings();

    determinePositive: CustomPositive = new CustomPositive();

    headers: HeaderSettings = new HeaderSettings();
}

export class ScrollerSettings {
    pSpeed: number = 1.2;
    pInterval: number = 50;
}

export class StatusSettings {
    pShouldIndicatePosNeg: boolean = true;
    pShouldUsePosNegColoring: boolean = true;
    pShouldUseTextColoring: boolean = false;
}

export class TextSettings {
    pShouldAutoSizeFont: boolean = false;
    pFontSize: number = 20;
    pCustomText: string = "";
}

export class ColorSettings {
    pForeColor: powerbi.Fill = { solid: { color: "#ffffff" } };
    pBgColor: powerbi.Fill = { solid: { color: "#000000" } };
    positiveColour: powerbi.Fill = { solid: { color: "#96C401" } };
    negativeColour: powerbi.Fill = { solid: { color: "#DC0002" } };
}

export class CustomPositive {
    custom: boolean = false;
    when: string;
    value: string;
    custom2: boolean = false;
    when2: string;
    value2: string;
}

export class HeaderSettings {
    header1: string;
    header2: string;
    header3: string;
}
