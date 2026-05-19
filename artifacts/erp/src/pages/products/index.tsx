import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListProducts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { apiFetch } from "../../lib/api";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkIO } from "@/components/bulk-io";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductsList() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  // Note: we can map category string to valid API values if needed
  const queryParams: any = { page, limit: 50 };
  if (search) queryParams.search = search;
  if (category !== "ALL") queryParams.category = category;

  const { data, isLoading } = useListProducts(queryParams);
  const qc = useQueryClient();

  // Dynamic category list — managed at /categories.
  const { data: categoriesResp } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const token = localStorage.getItem("erp_token") || "";
      const r = await apiFetch("/api/v1/categories", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return r.json();
    },
  });
  const categoryList = (((categoriesResp as { data?: Array<{ name: string; isActive?: boolean }> } | undefined)?.data) ?? [])
    .filter((c) => c.isActive !== false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products Catalog</h2>
          <p className="text-muted-foreground">Manage firecracker catalog, variants, and pricing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkIO resource="products" label="Products" onImported={() => qc.invalidateQueries()} />
          <Button asChild>
            <Link href="/products/new">
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products by code or name..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {categoryList.map((c) => (
                <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.code}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal rounded-sm">
                      {product.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.status === 'Active' ? 'default' : 'destructive'} className="font-normal rounded-sm">
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.variants?.length || 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/products/${product.id}`}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination controls would go here */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <div>Showing {data?.data?.length || 0} products</div>
      </div>
    </div>
  );
}
