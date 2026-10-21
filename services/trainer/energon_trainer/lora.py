"""LoRA fine-tuning on successful trajectories (Unsloth + TRL, GPU only)."""

from __future__ import annotations

from pathlib import Path

LORA_RANK = 16
LORA_ALPHA = 32
EPOCHS = 2
MAX_SEQ_LENGTH = 4096
TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def train_lora(base_model: str, conversations: list[list[dict]], output_dir: Path) -> Path:
    if not conversations:
        raise ValueError("no successful trajectories to train on")

    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer
    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=MAX_SEQ_LENGTH,
        load_in_4bit=True,
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_RANK,
        lora_alpha=LORA_ALPHA,
        lora_dropout=0.0,
        target_modules=TARGET_MODULES,
        use_gradient_checkpointing="unsloth",
        random_state=7,
    )
    texts = [tokenizer.apply_chat_template(conversation, tokenize=False) for conversation in conversations]
    dataset = Dataset.from_dict({"text": texts})
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            output_dir=str(output_dir / "checkpoints"),
            dataset_text_field="text",
            max_seq_length=MAX_SEQ_LENGTH,
            num_train_epochs=EPOCHS,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            warmup_ratio=0.05,
            lr_scheduler_type="cosine",
            logging_steps=10,
            save_strategy="no",
            report_to=[],
            seed=7,
        ),
    )
    trainer.train()
    adapter_dir = output_dir / "adapter"
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    return adapter_dir
