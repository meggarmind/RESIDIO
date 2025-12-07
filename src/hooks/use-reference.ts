'use client';

import { useQuery } from '@tanstack/react-query';
import { getStreets } from '@/actions/reference/get-streets';
import { getHouseTypes } from '@/actions/reference/get-house-types';

export function useStreets() {
  return useQuery({
    queryKey: ['streets'],
    queryFn: async () => {
      const result = await getStreets();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useHouseTypes() {
  return useQuery({
    queryKey: ['house-types'],
    queryFn: async () => {
      const result = await getHouseTypes();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}
