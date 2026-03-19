import polars as pl
from dashboard_app.services.column_classifier import classify_column

def test_classification():
    data = {
        "binary_int": [0, 1, 0, 1, 0] * 20,
        "binary_float": [0.0, 1.0, 0.0, 1.0, 0.0] * 20,
        "low_card_int": [1, 2, 3, 1, 2, 1] * 16 + [1, 2, 3, 1],
        "low_card_float": [10.5, 20.5, 10.5, 20.5] * 25,
        "high_card_int": list(range(100)),
        "high_card_float": [x * 1.1 for x in range(100)],
        "id_col": list(range(100)),
        "price_col": [9.99, 19.99, 29.99, 9.99] * 25,
        "date_col": [pl.date(2023, 1, 1)] * 100,
        "datetime_col": [pl.datetime(2023, 1, 1, 12, 0, 0)] * 100,
    }
    
    df = pl.DataFrame(data)
    
    print(f"{'Column':<20} | {'DType':<10} | {'Semantic Type'}")
    print("-" * 50)
    for col in df.columns:
        sem_type = classify_column(df[col])
        print(f"{col:<20} | {str(df[col].dtype):<10} | {sem_type}")

if __name__ == "__main__":
    test_classification()
