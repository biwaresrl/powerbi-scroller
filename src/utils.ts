import powerbi from "powerbi-visuals-api";

import DataViewCategorical = powerbi.DataViewCategorical;
import DataViewObjects = powerbi.DataViewObjects;
import DataViewObject = powerbi.DataViewObject;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;

export function getMeasureIndex(dv: DataViewCategorical, measureName: string): number {
    let RetValue: number = -1;
    for (let i = 0; i < dv.values.length; i++) {
        if (dv.values[i].source.roles[measureName] === true) {
            RetValue = i;
            break;
        }
    }
    return RetValue;
}

export function getValue<T>(objects: DataViewObjects, objectName: string, propertyName: string, defaultValue: T): T {
    if (objects) {
        let object = objects[objectName];
        if (object) {
            let property: T = <T>object[propertyName];
            if (property !== undefined) {
                return property;
            }
        }
    }
    return defaultValue;
}

export function getCategoricalObjectValue<T>(category: DataViewCategoryColumn, index: number, objectName: string, propertyName: string, defaultValue: T): T {
    let categoryObjects = category.objects;

    if (categoryObjects) {
        let categoryObject: DataViewObject = categoryObjects[index];
        if (categoryObject) {
            let object = categoryObject[objectName];
            if (object) {
                let property: T = <T>object[propertyName];
                if (property !== undefined) {
                    return property;
                }
            }
        }
    }
    return defaultValue;
}
