import { configureStore } from '@reduxjs/toolkit';
import assetManagementReducer from './slices/asset-management-slice';

export const store = configureStore({
  reducer: {
    assetManagement: assetManagementReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
