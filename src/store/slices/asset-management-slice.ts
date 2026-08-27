import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  launchAssetManagement as launchAssetManagementRequest,
  type LaunchAssetManagementResponse,
} from '@/lib/launch-asset-management';

export type AssetManagementLaunchStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface AssetManagementState {
  status: AssetManagementLaunchStatus;
  error: string | null;
  redirectUrl: string | null;
}

const initialState: AssetManagementState = {
  status: 'idle',
  error: null,
  redirectUrl: null,
};

/** Calls GET /apps/asset-management/launch (api → controller). */
export const launchAssetManagement = createAsyncThunk<
  LaunchAssetManagementResponse,
  void,
  { rejectValue: string }
>('assetManagement/launch', async (_, { rejectWithValue }) => {
  try {
    return await launchAssetManagementRequest();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to open Asset Management.';
    return rejectWithValue(message);
  }
});

const assetManagementSlice = createSlice({
  name: 'assetManagement',
  initialState,
  reducers: {
    resetAssetManagementLaunch(state) {
      state.status = 'idle';
      state.error = null;
      state.redirectUrl = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(launchAssetManagement.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.redirectUrl = null;
      })
      .addCase(launchAssetManagement.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.redirectUrl = action.payload.redirect_url;
        state.error = null;
      })
      .addCase(launchAssetManagement.rejected, (state, action) => {
        state.status = 'failed';
        state.redirectUrl = null;
        state.error = action.payload ?? action.error.message ?? 'Unable to open Asset Management.';
      });
  },
});

export const { resetAssetManagementLaunch } = assetManagementSlice.actions;
export default assetManagementSlice.reducer;
