import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * StockReceiveScreen redirects to Module 5: Purchasing (Receive Delivery tab)
 */
export const StockReceiveScreen = () => {
  return <Navigate to="/purchasing?tab=receive_orders" replace />;
};

export default StockReceiveScreen;
