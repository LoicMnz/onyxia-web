import { useMemo, memo } from "react";
import Slider from "@material-ui/core/Slider";
import type { SliderProps } from "@material-ui/core/Slider";
import { assert } from "tsafe/assert";
import { is } from "tsafe/is";
import { useConstCallback } from "powerhooks/useConstCallback";
import { Text, makeStyles } from "app/theme";
import type { ReactNode } from "react";
import { symToStr } from "tsafe/symToStr";
import { capitalize } from "tsafe/capitalize";
import { useWithProps } from "powerhooks/useWithProps";
import { useDomRect } from "powerhooks/useDomRect";

export type RangeSliderProps = {
    className?: string;
    label: NonNullable<ReactNode>;
    min: number;
    max: number;
    step: number;
    unit: string;
    lowExtremitySemantic: string;
    highExtremitySemantic: string;

    valueLow: number;
    valueHigh: number;
    setValue(params: { extremity: "low" | "high"; value: number }): void;
};

const useStyles = makeStyles()(theme => ({
    "label": {
        "marginBottom": theme.spacing(3),
    },
    "wrapper": {
        "display": "flex",
    },
    "slider": {
        "flex": 1,
        "margin": theme.spacing(0, 4),
        "minWidth": 150,
    },
}));

export const RangeSlider = memo((props: RangeSliderProps) => {
    const {
        className,
        label,
        min,
        max,
        step,
        unit,
        lowExtremitySemantic,
        highExtremitySemantic,
        valueLow,
        valueHigh,
        setValue,
    } = props;

    const { classes } = useStyles();

    const muiSliderValue = useMemo(() => {
        assert(
            valueLow <= valueHigh,
            `RangeSlider error, ${symToStr({
                valueLow,
            })} must always be inferior or equal to ${symToStr({ valueHigh })}`,
        );

        return [valueLow, valueHigh];
    }, [valueLow, valueHigh]);

    const onChange = useConstCallback<SliderProps["onChange"]>((...[, value]: any[]) => {
        assert(is<[number, number]>(value));

        const [newValueLow, newValueHigh] = value;

        if (newValueLow !== valueLow) {
            setValue({ "extremity": "low", "value": newValueLow });
        }

        if (newValueHigh !== valueHigh) {
            setValue({ "extremity": "high", "value": newValueHigh });
        }
    });

    const textComponentProps = useMemo(
        () => ({
            "id": `text-${~~(Math.random() * 1000000)}`,
        }),
        [],
    );

    const ValueDisplayWp = useWithProps(ValueDisplay, { unit });

    const {
        ref,
        domRect: { width },
    } = useDomRect();

    /* Display marks only if each marks separated by at least 5px */
    const marks = useMemo(
        () => (width * step) / (max - min) >= 5,
        [width, step, max, min],
    );

    return (
        <div className={className} ref={ref}>
            <Text
                className={classes.label}
                typo="label 2"
                componentProps={textComponentProps}
            >
                {label}
            </Text>
            <div className={classes.wrapper}>
                <ValueDisplayWp
                    className={undefined}
                    semantic={lowExtremitySemantic}
                    value={valueLow}
                />
                <Slider
                    className={classes.slider}
                    value={muiSliderValue}
                    onChange={onChange}
                    step={step}
                    marks={marks}
                    min={min}
                    max={max}
                    valueLabelDisplay="off"
                    aria-labelledby={textComponentProps.id}
                />
                <ValueDisplayWp
                    className={undefined}
                    semantic={highExtremitySemantic}
                    value={valueHigh}
                />
            </div>
        </div>
    );
});

const { ValueDisplay } = (() => {
    type Props = {
        className?: string;
        unit: string;
        semantic: string;
        value: number;
    };

    const useStyles = makeStyles()(theme => ({
        "caption": {
            "color": theme.colors.useCases.typography.textSecondary,
        },
    }));

    const ValueDisplay = memo((props: Props) => {
        const { className, value, unit, semantic } = props;

        const { classes } = useStyles();

        return (
            <div className={className}>
                <Text typo="label 1">
                    {value} {unit}
                </Text>
                <Text className={classes.caption} typo="caption">
                    {capitalize(semantic)}
                </Text>
            </div>
        );
    });

    return { ValueDisplay };
})();