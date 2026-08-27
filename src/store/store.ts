import { configureStore, createSlice } from '@reduxjs/toolkit';

/** Placeholder root slice so the store boots; replace/extend via slices/ as features land. */
const appSlice = createSlice({
  name: 'app',
  initialState: { ready: true as boolean },
  reducers: {},
});

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    // Feature slices register here as they are added under src/store/slices/
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
