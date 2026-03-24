export type Category = {
  id: number;
  name: string;
  image_url?: string;
  [key: string]: any;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  params?: string[];
  category_name?: string;
  available?: boolean;
  qty_values?: { min?: number; max?: number };
  product_type?: string;
  parent_id?: number;
  image_url?: string;
  [key: string]: any;
};

export type Profile = {
  status?: string;
  balance?: string | number;
  email?: string;
};

export type ContentResponse = {
  status?: string;
  categories?: Category[];
  products?: Product[];
};
