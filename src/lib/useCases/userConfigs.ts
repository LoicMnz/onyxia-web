import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk } from "../setup";
import { join as pathJoin } from "path";
import { Id } from "tsafe/id";
import { objectKeys } from "tsafe/objectKeys";
import { assert } from "tsafe/assert";
import {
    createObjectThatThrowsIfAccessedFactory,
    isPropertyAccessedByReduxOrStorybook,
} from "../tools/createObjectThatThrowsIfAccessed";
import "minimal-polyfills/Object.fromEntries";
import { thunks as userAuthenticationThunks } from "./userAuthentication";

/*
 * Values of the user profile that can be changed.
 * Those value are persisted in the secret manager
 * (That is currently vault)
 */

const { createObjectThatThrowsIfAccessed } = createObjectThatThrowsIfAccessedFactory({
    "isPropertyWhitelisted": isPropertyAccessedByReduxOrStorybook,
});

export type UserConfigs = Id<
    Record<string, string | boolean | number | null>,
    {
        userServicePassword: string;
        kaggleApiToken: string | null;
        gitName: string;
        gitEmail: string;
        gitCredentialCacheDuration: number;
        isBetaModeEnabled: boolean;
        isDarkModeEnabled: boolean;
        deploymentRegionId: string | null;
        githubPersonalAccessToken: string | null;
        doDisplayMySecretsUseInServiceDialog: boolean;
        bookmarkedServiceConfigurationStr: string | null;
    }
>;

export type UserConfigsState = {
    [K in keyof UserConfigs]: {
        value: UserConfigs[K];
        isBeingChanged: boolean;
    };
};

export const name = "userConfigs";

const { reducer, actions } = createSlice({
    name,
    "initialState": createObjectThatThrowsIfAccessed<UserConfigsState>({
        "debugMessage":
            "The userConfigState should have been initialized during the store initialization",
    }),
    "reducers": {
        "initializationCompleted": (
            ...[, { payload }]: [any, PayloadAction<{ userConfigs: UserConfigs }>]
        ) => {
            const { userConfigs } = payload;

            return Object.fromEntries(
                Object.entries(userConfigs).map(([key, value]) => [
                    key,
                    { value, "isBeingChanged": false },
                ]),
            ) as any;
        },
        "changeStarted": (state, { payload }: PayloadAction<ChangeValueParams>) => {
            const wrap = state[payload.key];

            wrap.value = payload.value;
            wrap.isBeingChanged = true;
        },
        "changeCompleted": (
            state,
            { payload }: PayloadAction<{ key: keyof UserConfigs }>,
        ) => {
            state[payload.key].isBeingChanged = false;
        },
    },
});

export { reducer };

export type ChangeValueParams<K extends keyof UserConfigs = keyof UserConfigs> = {
    key: K;
    value: UserConfigs[K];
};

export const thunks = {
    "changeValue":
        <K extends keyof UserConfigs>(params: ChangeValueParams<K>): AppThunk =>
        async (...args) => {
            const [dispatch, getState, { secretsManagerClient, oidcClient }] = args;

            assert(oidcClient.isUserLoggedIn);

            if (getState().userConfigs[params.key].value === params.value) {
                return;
            }

            const { username } = dispatch(userAuthenticationThunks.getUser());

            dispatch(actions.changeStarted(params));

            const { getConfigKeyPath: getProfileKeyPath } = getConfigKeyPathFactory({
                username,
            });

            await secretsManagerClient.put({
                "path": getProfileKeyPath({ "key": params.key }),
                "secret": { "value": params.value },
            });

            dispatch(actions.changeCompleted(params));
        },
    "renewUserServicePassword": (): AppThunk => dispatch =>
        dispatch(
            thunks.changeValue({
                "key": "userServicePassword",
                "value": generatePassword(),
            }),
        ),
    "resetHelperDialogs": (): AppThunk => dispatch =>
        dispatch(
            thunks.changeValue({
                "key": "doDisplayMySecretsUseInServiceDialog",
                "value": true,
            }),
        ),
};

export const privateThunks = {
    "initialize":
        (): AppThunk =>
        async (...args) => {
            const [
                dispatch,
                ,
                {
                    secretsManagerClient,
                    oidcClient,
                    createStoreParams: {
                        getIsDarkModeEnabledValueForProfileInitialization,
                    },
                },
            ] = args;

            assert(oidcClient.isUserLoggedIn);

            const { username, email } = dispatch(userAuthenticationThunks.getUser());

            const { getConfigKeyPath } = getConfigKeyPathFactory({ username });

            //Default values
            const userConfigs: UserConfigs = {
                "userServicePassword": generatePassword(),
                "kaggleApiToken": null,
                "gitName": username,
                "gitEmail": email,
                "gitCredentialCacheDuration": 0,
                "isBetaModeEnabled": false,
                "isDarkModeEnabled": getIsDarkModeEnabledValueForProfileInitialization(),
                "deploymentRegionId": null,
                "githubPersonalAccessToken": null,
                "doDisplayMySecretsUseInServiceDialog": true,
                "bookmarkedServiceConfigurationStr": null,
            };

            await Promise.all(
                objectKeys(userConfigs).map(async key => {
                    const path = getConfigKeyPath({ key });

                    const secretWithMetadata = await secretsManagerClient
                        .get({ path })
                        .catch(() => undefined);

                    const isLegacyValue = (value: unknown) => {
                        switch (key) {
                            case "deploymentRegionId":
                                return value === null;
                        }
                        return false;
                    };

                    const value = !secretWithMetadata
                        ? undefined
                        : secretWithMetadata.secret["value"];

                    if (value === undefined || isLegacyValue(value)) {
                        //Store default value.
                        await secretsManagerClient.put({
                            path,
                            "secret": { "value": userConfigs[key] },
                        });

                        return;
                    }

                    Object.assign(userConfigs, { [key]: value });
                }),
            );

            dispatch(actions.initializationCompleted({ userConfigs }));
        },
};

const generatePassword = () =>
    Array(2)
        .fill("")
        .map(() => Math.random().toString(36).slice(-10))
        .join("");

const getConfigKeyPathFactory = (params: { username: string }) => {
    const { username } = params;

    const getConfigKeyPath = (params: { key: keyof UserConfigs }) => {
        const { key } = params;

        return pathJoin(username, ".onyxia", key);
    };

    return { getConfigKeyPath };
};

export function userConfigsStateToUserConfigs(state: UserConfigsState): UserConfigs {
    const userProfileInVault: any = {};

    objectKeys(state).forEach(key => (userProfileInVault[key] = state[key].value));

    return userProfileInVault;
}
