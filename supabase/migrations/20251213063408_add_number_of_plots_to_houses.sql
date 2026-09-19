-- Add number_of_plots column to houses table
-- Used to calculate Development Levy (₦500,000 per plot)
-- Default is 1 plot for existing and new houses

ALTER TABLE houses ADD COLUMN number_of_plots INTEGER NOT NULL DEFAULT 1;

-- Ensure at least 1 plot
ALTER TABLE houses ADD CONSTRAINT houses_number_of_plots_check CHECK (number_of_plots >= 1);

-- Add comment for documentation
COMMENT ON COLUMN houses.number_of_plots IS 'Number of plots the house is built on. Used to calculate Development Levy (multiplied by base rate).';
