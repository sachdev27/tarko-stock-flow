-- Create rolls/stock_units table to track individual rolls within batches
CREATE TABLE public.rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id),
  length_meters NUMERIC NOT NULL CHECK (length_meters >= 0),
  initial_length_meters NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'PARTIAL', 'SOLD_OUT')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add roll_id reference to transactions to link transactions to specific rolls
ALTER TABLE public.transactions 
ADD COLUMN roll_id UUID REFERENCES public.rolls(id);

-- Create indexes for performance
CREATE INDEX idx_rolls_batch_id ON public.rolls(batch_id);
CREATE INDEX idx_rolls_product_variant_id ON public.rolls(product_variant_id);
CREATE INDEX idx_rolls_status ON public.rolls(status);
CREATE INDEX idx_transactions_roll_id ON public.transactions(roll_id);

-- Add trigger for updated_at
CREATE TRIGGER update_rolls_updated_at
  BEFORE UPDATE ON public.rolls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.rolls ENABLE ROW LEVEL SECURITY;

-- RLS policies for rolls
CREATE POLICY "Everyone can view rolls"
  ON public.rolls
  FOR SELECT
  USING (deleted_at IS NULL);

CREATE POLICY "Admins and users can create rolls"
  ON public.rolls
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role));

CREATE POLICY "Admins and users can update rolls"
  ON public.rolls
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'user'::app_role));

CREATE POLICY "Only admins can delete rolls"
  ON public.rolls
  FOR DELETE
  USING (is_admin(auth.uid()));